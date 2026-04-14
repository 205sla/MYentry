const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const app = express();
const PORT = 3000;
const ENT_DIR = path.join(__dirname, 'ENT');

app.use(express.static(path.join(__dirname, 'public')));

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

// GET /api/problems - list available problems
app.get('/api/problems', (req, res) => {
    try {
        const files = fs.readdirSync(ENT_DIR).filter(f => f.endsWith('.ent'));
        const problems = files.map(f => {
            const id = parseInt(path.basename(f, '.ent'));
            return { id, title: '문제 ' + id };
        }).sort((a, b) => a.id - b.id);
        res.json(problems);
    } catch (e) {
        res.json([]);
    }
});

// GET /api/problems/:id - get project data from .ent file
app.get('/api/problems/:id', (req, res) => {
    const entPath = path.join(ENT_DIR, req.params.id + '.ent');
    if (!fs.existsSync(entPath)) {
        return res.status(404).json({ error: 'not found' });
    }
    try {
        const gz = fs.readFileSync(entPath);
        const tarBuf = zlib.gunzipSync(gz);
        const jsonStr = extractProjectJson(tarBuf);
        if (!jsonStr) {
            return res.status(500).json({ error: 'project.json not found in .ent' });
        }
        // Replace old bower_components path with current lib path
        const fixed = jsonStr
            .replace(/\.\/bower_components\/entry-js\//g, 'lib/entry-js/')
            .replace(/\.\/node_modules\/@entrylabs\/entry\//g, 'lib/entry-js/');
        const project = JSON.parse(fixed);
        res.json(project);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log('Entry Editor running at http://localhost:' + PORT);
});
