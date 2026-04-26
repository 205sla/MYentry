// SQLite 연결 초기화·싱글톤 반환.
// - 기본은 DB_PATH (config.js) 기반 파일 DB
// - 테스트는 getDb({ path: ':memory:' })로 격리된 인스턴스 생성
// - WAL 모드로 동시성 향상 (읽기 중에도 쓰기 가능)

'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA_SQL = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
);

// 파일 경로별로 인스턴스 캐시 (같은 경로면 같은 핸들 반환).
// :memory:는 호출마다 새로 만들어야 격리되므로 캐시 안 함.
const cache = new Map();

/**
 * SQLite 핸들을 가져온다.
 * @param {object} [opts]
 * @param {string} [opts.path] 파일 경로. 기본: config.DB_PATH
 *                              ':memory:' 지정 시 매번 새 인스턴스(테스트용).
 * @returns {Database.Database}
 */
function getDb(opts = {}) {
    const target = opts.path || require('../config').DB_PATH;

    if (target !== ':memory:' && cache.has(target)) {
        return cache.get(target);
    }

    // 파일 DB면 부모 디렉터리 보장
    if (target !== ':memory:') {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    const db = new Database(target);

    // WAL: 읽기와 쓰기가 동시에 가능. 파일 DB에만 의미가 있고,
    // :memory:에서도 호출 자체는 무해 (no-op).
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // 스키마 멱등 적용
    db.exec(SCHEMA_SQL);

    if (target !== ':memory:') {
        cache.set(target, db);
    }
    return db;
}

/**
 * 캐시된 핸들을 닫는다 (테스트 정리용).
 */
function closeDb(target) {
    if (target && cache.has(target)) {
        cache.get(target).close();
        cache.delete(target);
    }
}

module.exports = { getDb, closeDb };
