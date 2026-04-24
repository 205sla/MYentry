// 스프라이트 카탈로그 (자유 모드 또는 문제별 필터).

const express = require('express');
const { isValidId, readMeta } = require('../services/problemService');
const { loadSpriteCatalog, filterSpritesByMeta } = require('../services/spriteService');

const router = express.Router();

// GET /api/sprites             — 전체 스프라이트 (자유 모드)
// GET /api/sprites?problem=N   — 문제의 meta.json sprites로 필터링
router.get('/', (req, res) => {
    const all = loadSpriteCatalog();
    const pid = req.query.problem;
    if (!pid) return res.json({ sprites: all });
    if (!isValidId(pid)) return res.status(400).json({ error: 'invalid id' });
    const meta = readMeta(pid);
    if (!meta) return res.json({ sprites: all }); // 없는 문제 → 전체 반환 (안전한 폴백)
    res.json({ sprites: filterSpritesByMeta(all, meta) });
});

module.exports = router;
