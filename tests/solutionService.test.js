'use strict';

// solutionService 단위 테스트.
// in-memory DB로 격리.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { getDb } = require('../src/db/init');
const userService = require('../src/services/userService');
const sol = require('../src/services/solutionService');

let db;
let alice, bob;

beforeEach(() => {
    db = getDb({ path: ':memory:' });
    alice = userService.createUser({ username: 'alice', passwordHash: 'h', birthYear: 2000 }, { db });
    bob = userService.createUser({ username: 'bob', passwordHash: 'h', birthYear: 2000 }, { db });
});

describe('markSolved (멱등 추가)', () => {
    it('첫 추가는 true 반환, 이후 IGNORE → false', () => {
        assert.equal(sol.markSolved(alice.id, '017', { db }), true);
        assert.equal(sol.markSolved(alice.id, '017', { db }), false);
    });

    it('다른 사용자가 같은 문제 추가는 독립적으로 true', () => {
        assert.equal(sol.markSolved(alice.id, '017', { db }), true);
        assert.equal(sol.markSolved(bob.id, '017', { db }), true);
    });

    it('solved_at은 첫 추가 시각으로 보존 (재추가 시 갱신 X)', async () => {
        sol.markSolved(alice.id, '001', { db });
        const first = sol.listSolutions(alice.id, { db })[0].solved_at;
        // 1초 이상 시각 차이 두기 어려우므로 row 기준으로 검증
        sol.markSolved(alice.id, '001', { db }); // IGNORE
        const second = sol.listSolutions(alice.id, { db })[0].solved_at;
        assert.equal(second, first, '두 번째 markSolved는 solved_at을 유지해야 함');
    });
});

describe('listProblemIds / listSolutions', () => {
    it('비어있을 때 []', () => {
        assert.deepEqual(sol.listProblemIds(alice.id, { db }), []);
        assert.deepEqual(sol.listSolutions(alice.id, { db }), []);
    });

    it('추가 순서대로 반환 (solved_at ASC)', () => {
        sol.markSolved(alice.id, '003', { db });
        sol.markSolved(alice.id, '001', { db });
        sol.markSolved(alice.id, '017', { db });

        const ids = sol.listProblemIds(alice.id, { db });
        assert.deepEqual(ids, ['003', '001', '017']);

        const detailed = sol.listSolutions(alice.id, { db });
        assert.equal(detailed.length, 3);
        assert.equal(detailed[0].problem_id, '003');
        assert.equal(typeof detailed[0].solved_at, 'number');
    });

    it('다른 사용자 기록은 섞이지 않음', () => {
        sol.markSolved(alice.id, '001', { db });
        sol.markSolved(bob.id, '002', { db });
        assert.deepEqual(sol.listProblemIds(alice.id, { db }), ['001']);
        assert.deepEqual(sol.listProblemIds(bob.id, { db }), ['002']);
    });
});

describe('unmarkSolved', () => {
    it('존재하면 true 후 사라짐', () => {
        sol.markSolved(alice.id, '001', { db });
        assert.equal(sol.unmarkSolved(alice.id, '001', { db }), true);
        assert.equal(sol.isSolved(alice.id, '001', { db }), false);
    });
    it('없으면 false (no-op)', () => {
        assert.equal(sol.unmarkSolved(alice.id, '999', { db }), false);
    });
});

describe('isSolved', () => {
    it('해결 후 true, 미해결은 false', () => {
        assert.equal(sol.isSolved(alice.id, '001', { db }), false);
        sol.markSolved(alice.id, '001', { db });
        assert.equal(sol.isSolved(alice.id, '001', { db }), true);
        // 다른 사용자에겐 영향 없음
        assert.equal(sol.isSolved(bob.id, '001', { db }), false);
    });
});

describe('countByUser', () => {
    it('0개 → 추가 → 정확한 개수', () => {
        assert.equal(sol.countByUser(alice.id, { db }), 0);
        sol.markSolved(alice.id, '001', { db });
        sol.markSolved(alice.id, '002', { db });
        sol.markSolved(alice.id, '001', { db }); // IGNORE
        assert.equal(sol.countByUser(alice.id, { db }), 2);
    });
});

describe('FOREIGN KEY CASCADE', () => {
    it('user 삭제 시 solutions 자동 삭제', () => {
        sol.markSolved(alice.id, '001', { db });
        sol.markSolved(alice.id, '002', { db });
        assert.equal(sol.countByUser(alice.id, { db }), 2);

        db.prepare('DELETE FROM users WHERE id = ?').run(alice.id);

        assert.equal(sol.countByUser(alice.id, { db }), 0);
    });
});

describe('schema_version v2', () => {
    it('v2가 적용됨', () => {
        const versions = db.prepare('SELECT version FROM schema_version ORDER BY version').all().map((r) => r.version);
        assert.deepEqual(versions, [1, 2]);
    });
});
