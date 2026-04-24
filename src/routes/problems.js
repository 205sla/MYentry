// 문제 관련 API: 목록·메타·테스트·프로젝트·자산.

const fs = require('fs');
const express = require('express');
const { PROBLEMS_DIR } = require('../config');
const {
    isValidId, readMeta, readDescription, readTests
} = require('../services/problemService');
const {
    loadProblemTar, extractTarFile, rewriteAssetUrl, mimeByExt
} = require('../services/assetService');

const router = express.Router();

// GET /api/problems — 모든 문제 목록 (meta.json이 있는 폴더)
router.get('/', (req, res) => {
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
    res.json(results);
});

// GET /api/problems/:id/meta — title + description
router.get('/:id/meta', (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'invalid id' });
    const meta = readMeta(req.params.id);
    if (!meta) return res.status(404).json({ error: 'not found' });
    res.json({
        id: parseInt(req.params.id, 10),
        title: meta.title,
        description: readDescription(req.params.id)
    });
});

// GET /api/problems/:id/tests?mode=test|submit
router.get('/:id/tests', (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'invalid id' });
    const tests = readTests(req.params.id);
    if (!tests) return res.status(404).json({ error: 'no tests' });

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
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'invalid id' });
    const id = req.params.id;
    const tarBuf = loadProblemTar(id);
    if (!tarBuf) return res.status(404).json({ error: 'not found' });
    try {
        const jsonBuf = extractTarFile(tarBuf, 'temp/project.json');
        if (!jsonBuf) return res.status(500).json({ error: 'project.json not found in .ent' });
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
        res.status(500).json({ error: e.message });
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
