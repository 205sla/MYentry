// POST /api/export — 실행 중인 Entry 프로젝트(JSON)를 .ent(gzip tar)로 번들.
// 브라우저 Entry 런타임이 보여주는 프로젝트를 playentry.org·자체 로더에서
// import 가능한 바이너리로 묶어 파일로 내려준다.
//
// 자산(/images/* 또는 /api/problems/:id/asset/*)은 Entry 관례 경로로 재배치:
//   temp/<aa>/<bb>/image/<hash>.<ext>   ← 원본 이미지
//   temp/<aa>/<bb>/thumb/<hash>.<ext>   ← 썸네일 (SVG는 PNG로 변환)
//   temp/<aa>/<bb>/sound/<hash>.<ext>   ← 사운드
//
// 각 picture에는 세 필드가 세팅된다:
//   filename : 32자 소문자 영숫자 (Entry 관례)
//   fileurl  : "temp/<aa>/<bb>/image/<hash>.<ext>"
//   thumbUrl : 일부러 삭제 — 자세한 이유는 아래 주석 참조
//
// tar 엔트리 레이아웃은 Entry 공식 export 순서를 따른다:
//   level-1 dirs → project.json → level-2 dirs → level-3 dirs → files.
// gzip memLevel: 6은 Entry 공식 문서에 맞춤.

const express = require('express');
const zlib = require('zlib');
const sharp = require('sharp');
const { THUMB_MAX_PX } = require('../config');
const {
    makeTar, entryStyleHash, resolveAsset
} = require('../services/assetService');

const router = express.Router();

// 개별 25MB JSON 파서 — 썸네일·스프라이트·사운드 포함 프로젝트도 수용.
// 전역 30KB 파서가 먼저 소비하지 않도록 src/server.js에서 경로 기반 분기.
router.post('/', express.json({ limit: '25mb' }), async (req, res) => {
    try {
        const project = req.body;
        if (!project || typeof project !== 'object' || !Array.isArray(project.objects)) {
            return res.status(400).json({ error: 'invalid project JSON' });
        }

        // tar 조립 시 순차 flush되는 버킷들
        const dirs1 = [];       // temp/XX/
        const dirs2 = [];       // temp/XX/YY/
        const dirs3 = [];       // temp/XX/YY/{image,thumb,sound}/
        const payloads = [];    // 실제 파일 데이터
        const seen = new Set();
        const cache = new Map(); // url → { fileurl, filename, thumbUrl } | passthrough

        const addDir = (bucket, p) => {
            if (seen.has(p)) return;
            seen.add(p);
            bucket.push({ name: p, data: Buffer.alloc(0), typeflag: '5' });
        };

        const bundleAsset = async (url, kind /* 'image' | 'sound' */) => {
            if (!url) return null;
            if (cache.has(url)) return cache.get(url);

            // 이미 아카이브 내부이거나 외부 절대 URL → 변환 없이 통과
            if (/^(\.\/)?temp\//.test(url) || /^(https?:|data:)/.test(url)) {
                const r = { fileurl: url, filename: null, thumbUrl: null };
                cache.set(url, r);
                return r;
            }

            const asset = resolveAsset(url);
            if (!asset) {
                const r = { fileurl: url, filename: null, thumbUrl: null };
                cache.set(url, r);
                return r;
            }

            const hash = entryStyleHash();
            const d1 = hash.slice(0, 2), d2 = hash.slice(2, 4);
            addDir(dirs1, `temp/${d1}/`);
            addDir(dirs2, `temp/${d1}/${d2}/`);
            addDir(dirs3, `temp/${d1}/${d2}/${kind}/`);

            // 원본(SVG/PNG/MP3 등)은 항상 포함
            const fileurl = `temp/${d1}/${d2}/${kind}/${hash}.${asset.ext}`;
            payloads.push({ name: fileurl, data: asset.buf, typeflag: '0' });

            let thumbUrl = null;
            if (kind === 'image') {
                // Entry 업로드 파이프라인은 SVG 옆에 동일 이름 PNG가 있어야 함
                // (공식 export들도 매번 SVG+PNG 쌍을 만든다). SVG만 래스터 변환.
                if (asset.ext === 'svg') {
                    try {
                        const pngBuf = await sharp(asset.buf).png().toBuffer();
                        payloads.push({
                            name: `temp/${d1}/${d2}/image/${hash}.png`,
                            data: pngBuf, typeflag: '0',
                        });
                    } catch (e) {
                        console.warn('SVG→PNG rasterize failed for', url, '—', e.message);
                    }
                }

                // 썸네일: thumb/ 아래 작은 PNG (Entry 관례 ~96px 긴변)
                addDir(dirs3, `temp/${d1}/${d2}/thumb/`);
                thumbUrl = `temp/${d1}/${d2}/thumb/${hash}.png`;
                try {
                    const thumbBuf = await sharp(asset.buf)
                        .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: 'inside' })
                        .png().toBuffer();
                    payloads.push({ name: thumbUrl, data: thumbBuf, typeflag: '0' });
                } catch (e) {
                    // 벡터 소스가 아니거나 native 의존성 누락 → 원본 경로로 폴백
                    console.warn('thumb rasterize failed for', url, '—', e.message);
                    thumbUrl = fileurl;
                }
            }

            const r = { fileurl, filename: hash, thumbUrl };
            cache.set(url, r);
            return r;
        };

        for (const obj of project.objects) {
            if (!obj || !obj.sprite) continue;
            for (const p of (obj.sprite.pictures || [])) {
                if (!p.fileurl) continue;
                const r = await bundleAsset(p.fileurl, 'image');
                if (!r) continue;
                p.fileurl = r.fileurl;
                if (r.filename) p.filename = r.filename;
                // thumbUrl은 의도적으로 제거. Entry 엔진은 thumbUrl이 있으면 그것을
                // 우선 사용하는데, .ent가 playentry.org 서버를 한 번 거치면 서버가
                // thumbUrl을 자체 해시로 재작성해 tar 내부 파일과 매치되지 않아
                // 오브젝트 리스트 프리뷰가 빈 상태가 된다 (이미지 본체는 정상).
                // 공식 export들도 thumbUrl을 빼고 filename에서 경로를 유도시키는
                // 쪽이 안정적인 것으로 확인.
                delete p.thumbUrl;
            }
            for (const sn of (obj.sprite.sounds || [])) {
                if (!sn.fileurl) continue;
                const r = await bundleAsset(sn.fileurl, 'sound');
                if (!r) continue;
                sn.fileurl = r.fileurl;
                if (r.filename) sn.filename = r.filename;
            }
        }

        const projectJson = {
            name: 'temp/project.json',
            data: Buffer.from(JSON.stringify(project), 'utf8'),
            typeflag: '0'
        };

        // Entry 공식 export와 동일 레이아웃: root → lv1 dirs → project.json →
        // lv2 dirs → lv3 dirs → payloads.
        const files = [
            { name: 'temp/', data: Buffer.alloc(0), typeflag: '5' },
            ...dirs1,
            projectJson,
            ...dirs2,
            ...dirs3,
            ...payloads
        ];

        const gz = zlib.gzipSync(makeTar(files), { memLevel: 6 });
        const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
        res.setHeader('Content-Type', 'application/x-gzip');
        res.setHeader('Content-Disposition', `attachment; filename="code205-${ts}.ent"`);
        res.setHeader('Content-Length', gz.length);
        res.send(gz);
    } catch (e) {
        console.error('export error:', e);
        res.status(500).json({ error: String(e.message || e) });
    }
});

module.exports = router;
