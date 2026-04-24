// .ent(gzip tar) 처리 유틸: 파싱·캐시·mime·URL 재작성·tar 생성·자산 resolve.
// export 라우트와 asset 라우트 모두가 이 모듈을 공유한다.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { PUBLIC_DIR } = require('../config');
const { problemDir } = require('./problemService');

// ─────── tar 파싱 / 번들 캐시 ───────

// tar에서 지정된 이름의 엔트리 raw bytes 반환. `path`와 `./path` 둘 다 허용 —
// Entry 에디터가 때때로 후자를 기록함.
function extractTarFile(buffer, targetName) {
    let offset = 0;
    while (offset < buffer.length - 512) {
        if (buffer[offset] === 0) break;
        const name = buffer.toString('utf8', offset, offset + 100).replace(/\0.*/, '');
        const sizeStr = buffer.toString('ascii', offset + 124, offset + 136).replace(/\0.*/, '').trim();
        const size = parseInt(sizeStr, 8) || 0;
        const dataStart = offset + 512;
        if (name === targetName || name === './' + targetName) {
            return buffer.slice(dataStart, dataStart + size);
        }
        offset = dataStart + Math.ceil(size / 512) * 512;
    }
    return null;
}

// id → {mtimeMs, tarBuf} 캐시. 파일 수정 시점으로 자동 무효화.
const __tarCache = new Map();

function loadProblemTar(id) {
    const p = path.join(problemDir(id), 'project.ent');
    let stat;
    try { stat = fs.statSync(p); } catch (e) { return null; }
    const cached = __tarCache.get(id);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.tarBuf;
    const tarBuf = zlib.gunzipSync(fs.readFileSync(p));
    __tarCache.set(id, { mtimeMs: stat.mtimeMs, tarBuf });
    return tarBuf;
}

// ─────── MIME ───────

const MIME_BY_EXT = {
    '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg',    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',     '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',     '.m4a': 'audio/mp4'
};

function mimeByExt(p) {
    return MIME_BY_EXT[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

// ─────── URL 재작성 (project.json fileurl 정규화) ───────

// project.json의 fileurl/thumbUrl을 브라우저가 접근 가능한 경로로 변환.
//   temp/XX/YY/…  → /api/problems/:id/asset/temp/XX/YY/…  (tar에서 서빙)
//   lib/…         → /lib/…                                  (public/ 정적 파일)
//   /images/…, http(s):, data:  변환 없음
function rewriteAssetUrl(url, id) {
    if (typeof url !== 'string' || !url) return url;
    if (/^(https?:|data:|\/)/.test(url)) return url;
    const clean = url.replace(/^\.\//, '');
    if (/^temp\//.test(clean)) return '/api/problems/' + id + '/asset/' + clean;
    if (/^lib\//.test(clean)) return '/' + clean;
    return url;
}

// ─────── tar 생성 (export 용) ───────

// Entry 서버가 쓰는 npm `tar` 패키지와 바이트 단위로 호환되는 ustar 헤더.
// 디렉터리 모드는 0755, 파일은 0644. mtime·uid·gid·uname 취급은
// 원 파일 주석(이전 server.js 177~210)에 자세히 있음 — 요약: npm tar의
// portable 출력과 바이트 단위로 맞춤.
function tarHeader(name, size, typeflag) {
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, 'utf8');
    const isDir = (typeflag === '5');
    h.write(isDir ? '000755 \0' : '000644 \0', 100, 8, 'ascii');
    h.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
    if (!isDir) {
        h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0',
                136, 12, 'ascii');
    }
    h.write('        ', 148, 8, 'ascii');      // 체크섬 자리(스페이스)
    h.write(typeflag, 156, 1, 'ascii');
    h.write('ustar\0', 257, 6, 'ascii');
    h.write('00', 263, 2, 'ascii');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += h[i];
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    return h;
}

function makeTar(files) {
    const parts = [];
    for (const f of files) {
        parts.push(tarHeader(f.name, f.data.length, f.typeflag || '0'));
        if (f.data.length > 0) {
            parts.push(f.data);
            const pad = (512 - (f.data.length % 512)) % 512;
            if (pad) parts.push(Buffer.alloc(pad));
        }
    }
    parts.push(Buffer.alloc(1024)); // end-of-archive (zero 블록 2개)
    return Buffer.concat(parts);
}

// Entry 스타일 32자 파일 id (소문자 영숫자). crypto.randomBytes % 36은
// 분포에 미세한 치우침이 있으나 여기선 무해.
function entryStyleHash() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    const bytes = crypto.randomBytes(32);
    let out = '';
    for (let i = 0; i < 32; i++) out += chars[bytes[i] % 36];
    return out;
}

// ─────── 자산 해석 (export 시 URL → raw bytes) ───────

// 허용 확장자: 이미지·오디오만. JS/CSS/HTML 번들링 방지.
const MEDIA_EXT_RE = /\.(svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a)$/i;

function resolveAsset(url) {
    if (typeof url !== 'string' || !url) return null;

    // ① API가 서빙하는 문제 자산 (import round-trip)
    const m = /^\/api\/problems\/(\d+)\/asset\/(.+)$/.exec(url);
    if (m) {
        const tarBuf = loadProblemTar(m[1]);
        if (!tarBuf) return null;
        const buf = extractTarFile(tarBuf, m[2]);
        if (!buf) return null;
        const ext = (path.extname(m[2]).slice(1) || 'bin').toLowerCase();
        return { buf, ext };
    }

    // ② public/ 하위의 절대경로 미디어 파일 (/images/*, /sprites/* 등)
    if (!url.startsWith('/') || url.startsWith('/api/')) return null;
    if (!MEDIA_EXT_RE.test(url)) return null;
    const publicDir = path.resolve(PUBLIC_DIR);
    const fsPath = path.resolve(publicDir, url.slice(1));
    // 경로 순회 방어
    if (!fsPath.startsWith(publicDir + path.sep) && fsPath !== publicDir) return null;
    if (!fs.existsSync(fsPath)) return null;
    const buf = fs.readFileSync(fsPath);
    const ext = (path.extname(url).slice(1) || 'bin').toLowerCase();
    return { buf, ext };
}

module.exports = {
    extractTarFile,
    loadProblemTar,
    mimeByExt,
    rewriteAssetUrl,
    tarHeader,
    makeTar,
    entryStyleHash,
    resolveAsset,
};
