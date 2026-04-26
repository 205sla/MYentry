// 문제 디렉터리·meta·description·tests 읽기.
// 이 모듈은 fs 접근을 캡슐화해 라우터가 파일 레이아웃을 몰라도 되게 함.

const fs = require('fs');
const path = require('path');
const { PROBLEMS_DIR } = require('../config');

function padId(id) {
    return String(parseInt(id, 10)).padStart(3, '0');
}

function problemDir(id) {
    return path.join(PROBLEMS_DIR, padId(id));
}

function isValidId(raw) {
    return /^\d+$/.test(String(raw));
}

// 실제로 problems/NNN/meta.json까지 있는 유효한 문제인지.
// /api/me/solved 라우트에서 잘못된 problem_id를 차단하는 용도.
function exists(id) {
    if (!isValidId(id)) return false;
    return readMeta(id) !== null;
}

function tryRead(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
}

// Windows 메모장 등이 남기는 UTF-8 BOM(EF BB BF)은 JSON.parse가 거부하므로
// 읽을 때 제거 — 과거 /api/problems에서 조용히 빠지는 원인이었음.
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

module.exports = {
    padId,
    problemDir,
    isValidId,
    exists,
    tryRead,
    readJsonFile,
    readMeta,
    readDescription,
    readTests,
};
