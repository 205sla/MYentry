// 문제 관련 API: 목록·메타·테스트·프로젝트·자산.
// 에러 응답 포맷은 _respond.fail로 통일 — { error: CODE, message: 한국어 }.
// 예외: /:id/has-tests는 항상 200 + {hasTests:bool} (클라이언트 단순 분기 호환),
//       /:id/asset/* 는 binary endpoint라 본문 없는 .end() 유지.

const fs = require('fs');
const express = require('express');
const { PROBLEMS_DIR } = require('../config');
const {
    isValidId, readMeta, readDescription, readTests
} = require('../services/problemService');
const {
    loadProblemTar, extractTarFile, rewriteAssetUrl, mimeByExt
} = require('../services/assetService');
const { fail } = require('./_respond');

const router = express.Router();

// GET /api/problems — 모든 문제 목록 (meta.json이 있는 폴더)
//
// 캐싱: 100문제 × meta.json 파싱은 매 요청 부담이라 메모리 캐시(60초 TTL).
// - TTL이 지나면 다음 요청 1건이 다시 디스크 스캔
// - 새 문제 추가는 60초 안에 반영 (또는 프로세스 재시작)
const LIST_CACHE_TTL_MS = 60 * 1000;
let listCache = null;
let listCacheAt = 0;

function buildProblemList() {
    const results = [];
    try {
        const entries = fs.readdirSync(PROBLEMS_DIR, { withFileTypes: true });
        entries.forEach(entry => {
            if (!entry.isDirectory()) return;
            if (!/^\d+$/.test(entry.name)) return;
            const id = parseInt(entry.name, 10);
            const meta = readMeta(id);
            if (!meta) return;
            results.push({
                id,
                title: meta.title || ('문제 ' + id),
                difficulty: meta.difficulty || 0,
                author: meta.author || null,
                contributors: Array.isArray(meta.contributors) ? meta.contributors : [],
                category: (meta.category === 'sample' || meta.category === 'tutorial') ? meta.category : null
            });
        });
    } catch (e) {}
    results.sort((a, b) => a.id - b.id);
    return results;
}

router.get('/', (req, res) => {
    const now = Date.now();
    if (!listCache || now - listCacheAt >= LIST_CACHE_TTL_MS) {
        listCache = buildProblemList();
        listCacheAt = now;
    }
    res.json(listCache);
});

// GET /api/problems/:id/meta — title + description
router.get('/:id/meta', (req, res) => {
    if (!isValidId(req.params.id)) return fail(res, 400, 'VALIDATION', '잘못된 문제 번호입니다.');
    const meta = readMeta(req.params.id);
    if (!meta) return fail(res, 404, 'NOT_FOUND', '존재하지 않는 문제입니다.');
    res.json({
        id: parseInt(req.params.id, 10),
        title: meta.title,
        description: readDescription(req.params.id)
    });
});

// GET /api/problems/:id/tests?mode=test|submit
router.get('/:id/tests', (req, res) => {
    if (!isValidId(req.params.id)) return fail(res, 400, 'VALIDATION', '잘못된 문제 번호입니다.');
    const tests = readTests(req.params.id);
    if (!tests) return fail(res, 404, 'NOT_FOUND', '테스트 케이스가 없습니다.');

    const mode = req.query.mode || 'test';
    const cases = Array.isArray(tests[mode]) ? tests[mode] : [];
    res.json({ mode, cases });
});

// GET /api/problems/:id/has-tests
router.get('/:id/has-tests', (req, res) => {
    if (!isValidId(req.params.id)) return res.json({ hasTests: false });
    const tests = readTests(req.params.id);
    const has = !!(tests && (tests.test || tests.submit));
    res.json({ hasTests: has });
});

// GET /api/problems/:id — .ent 파일의 project data
// picture/sound fileurl을 브라우저가 접근 가능한 경로로 재작성한 뒤 반환.
router.get('/:id', (req, res) => {
    if (!isValidId(req.params.id)) return fail(res, 400, 'VALIDATION', '잘못된 문제 번호입니다.');
    const id = req.params.id;
    const tarBuf = loadProblemTar(id);
    if (!tarBuf) return fail(res, 404, 'NOT_FOUND', '존재하지 않는 문제입니다.');
    try {
        const jsonBuf = extractTarFile(tarBuf, 'temp/project.json');
        if (!jsonBuf) return fail(res, 500, 'INTERNAL', '.ent에서 project.json을 찾을 수 없습니다.');
        const jsonStr = jsonBuf.toString('utf8')
            .replace(/\.\/bower_components\/entry-js\//g, 'lib/entry-js/')
            .replace(/\.\/node_modules\/@entrylabs\/entry\//g, 'lib/entry-js/');
        const project = JSON.parse(jsonStr);

        (project.objects || []).forEach(o => {
            if (!o || !o.sprite) return;
            (o.sprite.pictures || []).forEach(p => {
                if (p.fileurl)  p.fileurl  = rewriteAssetUrl(p.fileurl,  id);
                if (p.thumbUrl) p.thumbUrl = rewriteAssetUrl(p.thumbUrl, id);
            });
            (o.sprite.sounds || []).forEach(s => {
                if (s.fileurl)  s.fileurl  = rewriteAssetUrl(s.fileurl, id);
            });
        });

        res.json(project);
    } catch (e) {
        return fail(res, 500, 'INTERNAL', e.message);
    }
});

// GET /api/problems/:id/asset/<path> — .ent 내부 파일 서빙
// `temp/…` 경로만 허용하고 경로 순회 차단.
router.get('/:id/asset/*', (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).end();
    const subpath = req.params[0] || '';
    if (!/^temp\//.test(subpath)) return res.status(400).end();
    if (/(^|\/)\.\.(\/|$)/.test(subpath)) return res.status(400).end();

    const tarBuf = loadProblemTar(req.params.id);
    if (!tarBuf) return res.status(404).end();
    const buf = extractTarFile(tarBuf, subpath);
    if (!buf) return res.status(404).end();

    res.setHeader('Content-Type', mimeByExt(subpath));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
});

module.exports = router;
