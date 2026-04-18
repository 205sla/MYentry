const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

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
        { loc: SITE_URL + '/editor.html',     priority: '0.5', changefreq: 'monthly' },
        { loc: SITE_URL + '/privacy.html',    priority: '0.3', changefreq: 'yearly' },
        { loc: SITE_URL + '/terms.html',      priority: '0.3', changefreq: 'yearly' }
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

// Build a ustar-format tar entry header. Minimal fields for the Entry
// ecosystem (our extractor + playentry.org importer). typeflag: '0' file, '5' dir.
function tarHeader(name, size, typeflag) {
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, 'utf8');
    h.write('0000644\0', 100, 8, 'ascii');
    h.write('0000000\0', 108, 8, 'ascii');
    h.write('0000000\0', 116, 8, 'ascii');
    h.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
    h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii');
    h.write('        ', 148, 8, 'ascii');      // chksum placeholder (spaces)
    h.write(typeflag, 156, 1, 'ascii');
    h.write('ustar\0', 257, 6, 'ascii');
    h.write('00', 263, 2, 'ascii');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += h[i];
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    return h;
}

// Assemble an array of { name, data, typeflag } into a valid tar buffer.
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
    parts.push(Buffer.alloc(1024)); // end-of-archive marker (two zero blocks)
    return Buffer.concat(parts);
}

// Resolve an asset URL referenced in project.json to an on-disk file.
// Returns { buf, ext } or null. Whitelists /images/ under public/ only,
// with path-traversal defense (resolved path must stay inside publicDir).
function resolveLocalAsset(url) {
    if (typeof url !== 'string') return null;
    if (!/^\/images\//.test(url)) return null;
    const publicDir = path.resolve(__dirname, 'public');
    const fsPath = path.resolve(publicDir, url.slice(1));
    if (!fsPath.startsWith(publicDir + path.sep) && fsPath !== publicDir) return null;
    if (!fs.existsSync(fsPath)) return null;
    const buf = fs.readFileSync(fsPath);
    const ext = (path.extname(url).slice(1) || 'bin').toLowerCase();
    return { buf, ext };
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

// POST /api/export - repackage a live Entry project (JSON) into a .ent file
// that playentry.org (and our own loader) can import. For every picture/sound
// fileurl that points to a local /images/* asset we read the file from disk,
// embed it inside the tar under temp/<hh>/<hh>/(image|sound)/<hash>.<ext>,
// and rewrite the fileurl in project.json so the exported archive is
// self-contained. External URLs and data: URIs pass through unchanged.
app.post('/api/export', express.json({ limit: '25mb' }), (req, res) => {
    try {
        const project = req.body;
        if (!project || typeof project !== 'object' || !Array.isArray(project.objects)) {
            return res.status(400).json({ error: 'invalid project JSON' });
        }

        const files = [{ name: 'temp/', data: Buffer.alloc(0), typeflag: '5' }];
        const seenDirs = new Set(['temp/']);
        const cache = new Map(); // original url → rewritten tar path

        const addDir = (dirPath) => {
            if (seenDirs.has(dirPath)) return;
            seenDirs.add(dirPath);
            files.push({ name: dirPath, data: Buffer.alloc(0), typeflag: '5' });
        };

        const bundleAsset = (url, kind /* 'image' | 'sound' */) => {
            if (!url) return url;
            if (cache.has(url)) return cache.get(url);
            // Already an archive-relative path or absolute URL → leave alone.
            if (/^(\.\/)?temp\//.test(url)) return url;
            if (/^(https?:|data:)/.test(url)) return url;

            const asset = resolveLocalAsset(url);
            if (!asset) return url; // unknown → leave as-is; import may fail but we don't guess

            const hash = crypto.randomBytes(16).toString('hex'); // 32 hex chars
            const d1 = hash.slice(0, 2), d2 = hash.slice(2, 4);
            const newPath = `temp/${d1}/${d2}/${kind}/${hash}.${asset.ext}`;

            addDir(`temp/${d1}/`);
            addDir(`temp/${d1}/${d2}/`);
            addDir(`temp/${d1}/${d2}/${kind}/`);
            files.push({ name: newPath, data: asset.buf, typeflag: '0' });
            cache.set(url, newPath);
            return newPath;
        };

        project.objects.forEach(obj => {
            if (!obj || !obj.sprite) return;
            (obj.sprite.pictures || []).forEach(p => {
                if (p.fileurl) p.fileurl = bundleAsset(p.fileurl, 'image');
                if (p.thumbUrl) p.thumbUrl = bundleAsset(p.thumbUrl, 'image');
            });
            (obj.sprite.sounds || []).forEach(sn => {
                if (sn.fileurl) sn.fileurl = bundleAsset(sn.fileurl, 'sound');
            });
        });

        files.push({
            name: 'temp/project.json',
            data: Buffer.from(JSON.stringify(project), 'utf8'),
            typeflag: '0'
        });

        const gz = zlib.gzipSync(makeTar(files));
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

app.listen(PORT, () => {
    console.log('Entry Editor running at http://localhost:' + PORT);
});
