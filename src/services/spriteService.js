// public/sprites/catalog.json 로드 + meta.json의 sprites 필드로 필터링.

const { SPRITES_CATALOG } = require('../config');
const { tryRead, readJsonFile } = require('./problemService');

function loadSpriteCatalog() {
    return tryRead(() => readJsonFile(SPRITES_CATALOG), []);
}

// 문제의 meta.json sprites(id 배열)로 카탈로그 필터링.
// - 필드 없음/비배열 → 전체 반환 (기본)
// - [] → 빈 배열 반환 (명시적 차단)
// - ["sp01","sp03"] → 선언 순서대로 매칭 항목만
function filterSpritesByMeta(all, meta) {
    if (!meta || !Array.isArray(meta.sprites)) return all;
    const byId = {};
    all.forEach(function (s) { byId[s.id] = s; });
    return meta.sprites.map(function (id) { return byId[id]; }).filter(Boolean);
}

module.exports = {
    loadSpriteCatalog,
    filterSpritesByMeta,
};
