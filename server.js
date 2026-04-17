const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;
const PROBLEMS_DIR = path.join(__dirname, 'problems');
const SPRITES_CATALOG = path.join(__dirname, 'public', 'sprites', 'catalog.json');

const SITE_URL = process.env.SITE_URL || 'https://code.205.kr';

app.use(express.static(path.join(__dirname, 'public')));

// ========== SEO ==========

// Dynamic sitemap — lists static pages + every problem page.
// Regenerated on each request so new problems appear without a server restart.
app.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
        { loc: SITE_URL + '/',                priority: '1.0', changefreq: 'weekly' },
        { loc: SITE_URL + '/contribute.html', priority: '0.7', changefreq: 'monthly' },
        { loc: SITE_URL + '/editor.html',     priority: '0.5', changefreq: 'monthly' }
    ];
    try {
        const entries = fs.readdirSync(PROBLEMS_DIR, { withFileTypes: true });
        entries.forEach(entry => {
            if (!entry.isDirectory()) return;
            if (!/^\d+$/.test(entry.name)) return;
            const id = parseInt(entry.name, 10);
            if (!readMeta(id)) return;
            urls.push({
                loc: SITE_URL + '/editor.html?problem=' + id,
                priority: '0.8',
                changefreq: 'monthly'
            });
        });
    } catch (e) {}

    const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map(u =>
            '  <url>\n' +
            '    <loc>' + u.loc + '</loc>\n' +
            '    <lastmod>' + today + '</lastmod>\n' +
            '    <changefreq>' + u.changefreq + '</changefreq>\n' +
            '    <priority>' + u.priority + '</priority>\n' +
            '  </url>'
        ).join('\n') +
        '\n</urlset>\n';
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(body);
});

// ========== Helpers ==========

function padId(id) {
    return String(parseInt(id, 10)).padStart(3, '0');
}

function problemDir(id) {
    return path.join(PROBLEMS_DIR, padId(id));
}

function isValidId(raw) {
    return /^\d+$/.test(String(raw));
}

function tryRead(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
}

function readMeta(id) {
    return tryRead(() => JSON.parse(fs.readFileSync(path.join(problemDir(id), 'meta.json'), 'utf8')), null);
}

function readDescription(id) {
    return tryRead(() => fs.readFileSync(path.join(problemDir(id), 'description.md'), 'utf8'), '');
}

function readTests(id) {
    return tryRead(() => JSON.parse(fs.readFileSync(path.join(problemDir(id), 'tests.json'), 'utf8')), null);
}

function readProjectEnt(id) {
    const p = path.join(problemDir(id), 'project.ent');
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

function loadSpriteCatalog() {
    return tryRead(() => JSON.parse(fs.readFileSync(SPRITES_CATALOG, 'utf8')), []);
}

// Filter catalog by problem's meta.json `sprites` array (list of id values).
// Uses `id` as the unique key for lookup.
// - meta.sprites missing or not an array → return full catalog (default)
// - meta.sprites = [] → return empty (explicit block)
// - meta.sprites = ["sp01","sp03"] → return matching items in declared order
function filterSpritesByMeta(all, meta) {
    if (!meta || !Array.isArray(meta.sprites)) return all;
    const byId = {};
    all.forEach(function (s) { byId[s.id] = s; });
    return meta.sprites.map(function (id) { return byId[id]; }).filter(Boolean);
}

// Parse tar to extract temp/project.json
function extractProjectJson(buffer) {
    let offset = 0;
    while (offset < buffer.length) {
        if (buffer[offset] === 0) break;
        const name = buffer.toString('utf8', offset, offset + 100).replace(/\0/g, '');
        const sizeStr = buffer.toString('utf8', offset + 124, offset + 136).replace(/\0/g, '').trim();
        const size = parseInt(sizeStr, 8) || 0;
        const dataStart = offset + 512;
        if (name === 'temp/project.json' || name === './temp/project.json') {
            return buffer.toString('utf8', dataStart, dataStart + size);
        }
        offset = dataStart + Math.ceil(size / 512) * 512;
    }
    return null;
}

// ========== Endpoints ==========

// GET /api/problems - list all problems (directories with meta.json)
app.get('/api/problems', (req, res) => {
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
                contributors: Array.isArray(meta.contributors) ? meta.contributors : []
            });
        });
    } catch (e) {}
    results.sort((a, b) => a.id - b.id);
    res.json(results);
});

// GET /api/problems/:id/meta - title + description
app.get('/api/problems/:id/meta', (req, res) => {
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
app.get('/api/problems/:id/tests', (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'invalid id' });
    const tests = readTests(req.params.id);
    if (!tests) return res.status(404).json({ error: 'no tests' });

    const mode = req.query.mode || 'test';
    const cases = Array.isArray(tests[mode]) ? tests[mode] : [];
    res.json({ mode, cases });
});

// GET /api/problems/:id/has-tests
app.get('/api/problems/:id/has-tests', (req, res) => {
    if (!isValidId(req.params.id)) return res.json({ hasTests: false });
    const tests = readTests(req.params.id);
    const has = !!(tests && (tests.test || tests.submit));
    res.json({ hasTests: has });
});

// GET /api/sprites            - all sprites (free mode)
// GET /api/sprites?problem=N  - sprites filtered by problem's meta.json
app.get('/api/sprites', (req, res) => {
    const all = loadSpriteCatalog();
    const pid = req.query.problem;
    if (!pid) return res.json({ sprites: all });
    if (!isValidId(pid)) return res.status(400).json({ error: 'invalid id' });
    const meta = readMeta(pid);
    if (!meta) return res.json({ sprites: all }); // unknown problem → safe fallback
    res.json({ sprites: filterSpritesByMeta(all, meta) });
});

// GET /api/problems/:id - project data from .ent file
app.get('/api/problems/:id', (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'invalid id' });
    const gz = readProjectEnt(req.params.id);
    if (!gz) return res.status(404).json({ error: 'not found' });
    try {
        const tarBuf = zlib.gunzipSync(gz);
        const jsonStr = extractProjectJson(tarBuf);
        if (!jsonStr) return res.status(500).json({ error: 'project.json not found in .ent' });
        const fixed = jsonStr
            .replace(/\.\/bower_components\/entry-js\//g, 'lib/entry-js/')
            .replace(/\.\/node_modules\/@entrylabs\/entry\//g, 'lib/entry-js/');
        res.json(JSON.parse(fixed));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log('Entry Editor running at http://localhost:' + PORT);
});
