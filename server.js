const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const sharp = require('sharp');

// Thumbnail resolution used when rasterizing for .ent export (matches the
// compact PNGs Entry's own export produces — ~100px long edge).
const THUMB_MAX_PX = 96;

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

// Windows editors (Notepad, etc.) often save JSON with a leading UTF-8 BOM
// (EF BB BF). JSON.parse rejects it, which used to make a problem silently
// disappear from /api/problems. Strip it before parsing.
function readJsonFile(p) {
    let s = fs.readFileSync(p, 'utf8');
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    return JSON.parse(s);
}

function readMeta(id) {
    return tryRead(() => readJsonFile(path.join(problemDir(id), 'meta.json')), null);
}

function readDescription(id) {
    return tryRead(() => fs.readFileSync(path.join(problemDir(id), 'description.md'), 'utf8'), '');
}

function readTests(id) {
    return tryRead(() => readJsonFile(path.join(problemDir(id), 'tests.json')), null);
}


function loadSpriteCatalog() {
    return tryRead(() => readJsonFile(SPRITES_CATALOG), []);
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

// Parse tar and return the raw bytes of the named entry, or null if absent.
// Matches both `path` and `./path` (Entry editor sometimes emits the latter).
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

// In-memory tar cache keyed by problem id, invalidated by project.ent mtime.
// Each problem's .ent is unzipped at most once per file-system change — repeated
// asset requests hit the cache. Returns the tar Buffer or null if no .ent.
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

// Map file extension → HTTP Content-Type for tar-sourced assets.
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

// Rewrite a fileurl/thumbUrl from project.json so the browser can fetch it.
//   temp/XX/YY/…       → /api/problems/:id/asset/temp/XX/YY/…   (served from tar)
//   lib/…              → /lib/…                                  (served from public/)
//   /images/…, http(s):, data:  pass through untouched
function rewriteAssetUrl(url, id) {
    if (typeof url !== 'string' || !url) return url;
    if (/^(https?:|data:|\/)/.test(url)) return url;
    const clean = url.replace(/^\.\//, '');
    if (/^temp\//.test(clean)) return '/api/problems/' + id + '/asset/' + clean;
    if (/^lib\//.test(clean)) return '/' + clean;
    return url;
}

// Build a ustar-format tar entry header matching npm `tar` portable output
// (https://www.npmjs.com/package/tar). Entry's server-side importer uses the
// npm tar package; differences in header bytes — especially a directory that
// carries 0644 instead of 0755 — cause the importer to skip directory
// creation, after which child file paths fail to resolve and the uploaded
// project's fileurls never get rewritten to Entry's CDN. The result is that
// every image on playentry.org 404s.
//
// Portable format specifics (reproduced from the npm tar output we compared):
//   mode      : "000755 \0" for dirs, "000644 \0" for files (space + NUL)
//   uid/gid   : all-NUL (portable strips the actual values)
//   mtime     : all-NUL for dirs, octal timestamp for files
//   uname/gn. : left as NUL (portable)
//   magic/ver : "ustar\0" + "00"
function tarHeader(name, size, typeflag) {
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, 'utf8');
    const isDir = (typeflag === '5');
    h.write(isDir ? '000755 \0' : '000644 \0', 100, 8, 'ascii');
    // uid/gid: leave as NUL bytes (Buffer.alloc default)
    h.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
    if (!isDir) {
        h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0',
                136, 12, 'ascii');
    } // dirs: mtime stays all-NUL
    h.write('        ', 148, 8, 'ascii');      // chksum placeholder (spaces)
    h.write(typeflag, 156, 1, 'ascii');
    h.write('ustar\0', 257, 6, 'ascii');
    h.write('00', 263, 2, 'ascii');
    // uname/gname: leave as NUL bytes (portable)
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

// Generate a 32-char Entry-style file id. Entry's format uses lowercase
// alphanumerics (see official docs: e.g. "e49448cdlyy4s42e0013f820158i7nqj").
// crypto.randomBytes % 36 has a tiny distribution bias but is harmless here.
function entryStyleHash() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    const bytes = crypto.randomBytes(32);
    let out = '';
    for (let i = 0; i < 32; i++) out += chars[bytes[i] % 36];
    return out;
}

// Resolve an asset URL referenced in project.json to raw bytes + extension.
// Returns { buf, ext } or null. Two sources:
//   - /<anything>.<media-ext>  → read from public/ on disk (any path under public/)
//   - /api/problems/N/asset/temp/…  → read from that problem's .ent tar
// Extensions are whitelisted to image/audio formats so we never bundle JS/CSS/HTML.
// Path-traversal defense: resolved path must stay inside publicDir.
const MEDIA_EXT_RE = /\.(svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a)$/i;
function resolveAsset(url) {
    if (typeof url !== 'string' || !url) return null;

    // Branch 1: our API-served problem asset (round-trip from import)
    const m = /^\/api\/problems\/(\d+)\/asset\/(.+)$/.exec(url);
    if (m) {
        const tarBuf = loadProblemTar(m[1]);
        if (!tarBuf) return null;
        const buf = extractTarFile(tarBuf, m[2]);
        if (!buf) return null;
        const ext = (path.extname(m[2]).slice(1) || 'bin').toLowerCase();
        return { buf, ext };
    }

    // Branch 2: any absolute-path media file under public/
    // (catches /images/*, /sprites/*, and any future asset directories).
    if (!url.startsWith('/') || url.startsWith('/api/')) return null;
    if (!MEDIA_EXT_RE.test(url)) return null;
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
                contributors: Array.isArray(meta.contributors) ? meta.contributors : [],
                category: (meta.category === 'sample' || meta.category === 'tutorial') ? meta.category : null
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
// Rewrites picture/sound fileurls so browser requests land on either our
// asset endpoint (for tar-embedded assets) or our /public static tree.
app.get('/api/problems/:id', (req, res) => {
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

// GET /api/problems/:id/asset/<path>  — serve a file embedded in project.ent
// Accepts only `temp/…` paths (the Entry convention) and blocks traversal.
app.get('/api/problems/:id/asset/*', (req, res) => {
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

// POST /api/export - repackage a live Entry project (JSON) into a .ent file
// that playentry.org (and our own loader) can import. Assets (/images/* on
// disk, or /api/problems/:id/asset/* from an imported .ent) are embedded in
// the tar under Entry's conventional layout:
//   temp/<aa>/<bb>/image/<hash>.<ext>   ← original image
//   temp/<aa>/<bb>/thumb/<hash>.<ext>   ← thumbnail (reuses image bytes)
//   temp/<aa>/<bb>/sound/<hash>.<ext>   ← sound
//
// For every picture we set THREE fields that Entry's engine uses:
//   filename : 32-char lowercase alphanumeric (Entry convention)
//   fileurl  : "temp/<aa>/<bb>/image/<hash>.<ext>"
//   thumbUrl : "temp/<aa>/<bb>/thumb/<hash>.<ext>"
// Keeping `thumbUrl` is important — Entry's updateThumbnailView() picks it
// first; only when both thumbUrl AND fileurl are missing does it fall back
// to `filename + ".png"` under Entry.defaultPath (which breaks on playentry).
//
// Tar entries are laid out in the order Entry's own export produces:
//   level-1 dirs → project.json → level-2 dirs → level-3 dirs → files.
// Gzip uses memLevel: 6 to match Entry's documented setting.
app.post('/api/export', express.json({ limit: '25mb' }), async (req, res) => {
    try {
        const project = req.body;
        if (!project || typeof project !== 'object' || !Array.isArray(project.objects)) {
            return res.status(400).json({ error: 'invalid project JSON' });
        }

        // Buckets, flushed in the order below when assembling the final tar.
        const dirs1 = [];       // temp/XX/
        const dirs2 = [];       // temp/XX/YY/
        const dirs3 = [];       // temp/XX/YY/{image,thumb,sound}/
        const payloads = [];    // actual file data
        const seen = new Set();
        const cache = new Map(); // original url → { fileurl, filename } | null (bundled or passthrough)

        const addDir = (bucket, p) => {
            if (seen.has(p)) return;
            seen.add(p);
            bucket.push({ name: p, data: Buffer.alloc(0), typeflag: '5' });
        };

        const bundleAsset = async (url, kind /* 'image' | 'sound' */) => {
            if (!url) return null;
            if (cache.has(url)) return cache.get(url);

            // Already in-archive or external → leave unchanged, no filename.
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

            const hash = entryStyleHash(); // 32 lowercase-alphanumeric chars (Entry style)
            const d1 = hash.slice(0, 2), d2 = hash.slice(2, 4);
            addDir(dirs1, `temp/${d1}/`);
            addDir(dirs2, `temp/${d1}/${d2}/`);
            addDir(dirs3, `temp/${d1}/${d2}/${kind}/`);

            // Original file (SVG, PNG, MP3, etc.) always goes in.
            const fileurl = `temp/${d1}/${d2}/${kind}/${hash}.${asset.ext}`;
            payloads.push({ name: fileurl, data: asset.buf, typeflag: '0' });

            let thumbUrl = null;
            if (kind === 'image') {
                // Entry's upload pipeline expects a same-named PNG raster alongside
                // the SVG (every SVG in official .ent exports ships with a .png
                // sibling). Rasterize the SVG and drop it next to the original.
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

                // Thumbnail: a small PNG under thumb/ (matches Entry's convention
                // of PNG thumbnails with ~96px long edge).
                addDir(dirs3, `temp/${d1}/${d2}/thumb/`);
                thumbUrl = `temp/${d1}/${d2}/thumb/${hash}.png`;
                try {
                    const thumbBuf = await sharp(asset.buf)
                        .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: 'inside' })
                        .png().toBuffer();
                    payloads.push({ name: thumbUrl, data: thumbBuf, typeflag: '0' });
                } catch (e) {
                    // Non-raster source or native deps missing — point thumbUrl
                    // back to the original so Entry's engine renders *something*.
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
                // Intentionally DROP thumbUrl. Entry's engine checks thumbUrl
                // first and uses it verbatim when present; but once a .ent
                // round-trips through playentry.org the server rewrites its
                // own thumbUrl to a hash that has no matching file in the tar,
                // leaving the object-list preview blank even though the image
                // itself still renders. Entry's official exports omit the
                // field entirely — letting the engine derive the thumb path
                // from `filename` is the stable behavior.
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

        // Layout mirrors Entry's own export: root → level-1 dirs → project.json →
        // level-2 dirs → level-3 dirs → file payloads.
        const files = [
            { name: 'temp/', data: Buffer.alloc(0), typeflag: '5' },
            ...dirs1,
            projectJson,
            ...dirs2,
            ...dirs3,
            ...payloads
        ];

        // memLevel: 6 matches the setting documented for Entry's own .ent tooling.
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

app.listen(PORT, () => {
    console.log('Entry Editor running at http://localhost:' + PORT);
});
