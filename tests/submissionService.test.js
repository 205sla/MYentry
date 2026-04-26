'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { getDb } = require('../src/db/init');
const userService = require('../src/services/userService');
const sub = require('../src/services/submissionService');

let db;
let alice, bob;

beforeEach(() => {
    db = getDb({ path: ':memory:' });
    alice = userService.createUser({ username: 'alice', passwordHash: 'h', birthYear: 2000 }, { db });
    bob = userService.createUser({ username: 'bob', passwordHash: 'h', birthYear: 2000 }, { db });
});

describe('saveSubmission (덮어쓰기)', () => {
    it('첫 저장 → true 반환, get으로 조회 가능', () => {
        const ret = sub.saveSubmission(alice.id, '001', '{"hello":1}', { db });
        assert.equal(ret, true);
        const row = sub.getSubmission(alice.id, '001', { db });
        assert.equal(row.problem_id, '001');
        assert.equal(row.code, '{"hello":1}');
        assert.equal(typeof row.submitted_at, 'number');
    });

    it('재저장 → false (이미 있음), 새 코드로 덮어쓰기', () => {
        sub.saveSubmission(alice.id, '001', 'old', { db });
        const ret = sub.saveSubmission(alice.id, '001', 'new', { db });
        assert.equal(ret, false);
        assert.equal(sub.getSubmission(alice.id, '001', { db }).code, 'new');
    });

    it('다른 사용자가 같은 problem_id 저장은 독립적으로 true', () => {
        sub.saveSubmission(alice.id, '001', 'a', { db });
        const ret = sub.saveSubmission(bob.id, '001', 'b', { db });
        assert.equal(ret, true);
        assert.equal(sub.getSubmission(alice.id, '001', { db }).code, 'a');
        assert.equal(sub.getSubmission(bob.id, '001', { db }).code, 'b');
    });
});

describe('getSubmission', () => {
    it('없으면 null', () => {
        assert.equal(sub.getSubmission(alice.id, '999', { db }), null);
    });

    it('존재하면 전체 코드 + 메타 반환', () => {
        sub.saveSubmission(alice.id, '042', 'project json', { db });
        const r = sub.getSubmission(alice.id, '042', { db });
        assert.equal(r.problem_id, '042');
        assert.equal(r.code, 'project json');
        assert.ok(r.submitted_at > 0);
    });
});

describe('listSubmissions', () => {
    it('비어있으면 []', () => {
        assert.deepEqual(sub.listSubmissions(alice.id, { db }), []);
    });

    it('code 본문은 제외, code_size만 포함', () => {
        sub.saveSubmission(alice.id, '001', 'hello world', { db }); // 11
        sub.saveSubmission(alice.id, '042', 'a', { db });            // 1

        const list = sub.listSubmissions(alice.id, { db });
        assert.equal(list.length, 2);
        list.forEach(function (row) {
            assert.equal(row.code, undefined);
            assert.equal(typeof row.code_size, 'number');
            assert.ok(row.code_size >= 1);
            assert.ok(typeof row.problem_id === 'string');
            assert.ok(typeof row.submitted_at === 'number');
        });
    });

    it('submitted_at 내림차순 (최신 먼저), 동시 저장은 ROWID 내림차순', () => {
        sub.saveSubmission(alice.id, '001', 'first', { db });
        sub.saveSubmission(alice.id, '003', 'second', { db });
        sub.saveSubmission(alice.id, '017', 'third', { db });

        const ids = sub.listSubmissions(alice.id, { db }).map(function (r) { return r.problem_id; });
        // 같은 초에 추가됐으므로 ROWID 내림차순으로 가장 최근 ROWID(017)가 먼저
        assert.deepEqual(ids, ['017', '003', '001']);
    });

    it('다른 사용자의 제출은 안 보임', () => {
        sub.saveSubmission(alice.id, '001', 'a', { db });
        sub.saveSubmission(bob.id, '002', 'b', { db });
        assert.equal(sub.listSubmissions(alice.id, { db }).length, 1);
        assert.equal(sub.listSubmissions(bob.id, { db }).length, 1);
    });
});

describe('deleteSubmission', () => {
    it('존재 → true 후 사라짐', () => {
        sub.saveSubmission(alice.id, '001', 'x', { db });
        assert.equal(sub.deleteSubmission(alice.id, '001', { db }), true);
        assert.equal(sub.getSubmission(alice.id, '001', { db }), null);
    });

    it('없음 → false (멱등)', () => {
        assert.equal(sub.deleteSubmission(alice.id, '999', { db }), false);
    });
});

describe('countByUser', () => {
    it('0 → 추가 → 정확한 개수', () => {
        assert.equal(sub.countByUser(alice.id, { db }), 0);
        sub.saveSubmission(alice.id, '001', 'a', { db });
        sub.saveSubmission(alice.id, '002', 'b', { db });
        sub.saveSubmission(alice.id, '001', 'a2', { db }); // 덮어쓰기 — count 그대로
        assert.equal(sub.countByUser(alice.id, { db }), 2);
    });
});

describe('FOREIGN KEY CASCADE', () => {
    it('user 삭제 시 submissions 자동 삭제', () => {
        sub.saveSubmission(alice.id, '001', 'a', { db });
        sub.saveSubmission(alice.id, '002', 'b', { db });
        assert.equal(sub.countByUser(alice.id, { db }), 2);

        db.prepare('DELETE FROM users WHERE id = ?').run(alice.id);

        assert.equal(sub.countByUser(alice.id, { db }), 0);
    });
});

describe('schema_version v3', () => {
    it('v1·v2·v3 모두 적용됨', () => {
        const versions = db.prepare('SELECT version FROM schema_version ORDER BY version').all().map(function (r) { return r.version; });
        assert.deepEqual(versions, [1, 2, 3]);
    });
});
