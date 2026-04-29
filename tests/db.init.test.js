'use strict';

// db.init 스키마 마이그레이션 검증.
// - 새 DB 부트 시 schema_version에 BASELINE_VERSION 한 행만 들어가야 한다.
// - schema.sql 자체에 INSERT가 없으므로 baseline 행은 init.js만 INSERT.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getDb, BASELINE_VERSION } = require('../src/db/init');

describe('db.init schema_version', () => {
    it('새 DB 부트 시 schema_version에 BASELINE_VERSION 한 행', () => {
        const db = getDb({ path: ':memory:' });
        const rows = db.prepare('SELECT version FROM schema_version ORDER BY version').all();
        assert.deepEqual(rows.map((r) => r.version), [BASELINE_VERSION]);
    });

    it('BASELINE_VERSION은 양의 정수', () => {
        assert.equal(typeof BASELINE_VERSION, 'number');
        assert.ok(BASELINE_VERSION >= 1);
    });
});
