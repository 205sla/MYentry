'use strict';

// userService 단위 테스트.
// in-memory DB로 격리 (테스트 간 상호 영향 없음).

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { getDb } = require('../src/db/init');
const userService = require('../src/services/userService');

let db;
beforeEach(() => {
    // :memory:는 매 호출마다 새 인스턴스 → 완전 격리
    db = getDb({ path: ':memory:' });
});

describe('userService.createUser + findById', () => {
    it('필수 필드만으로 생성 → id 반환 + 조회 가능', () => {
        const u = userService.createUser({
            username: 'alice',
            passwordHash: 'hash1',
            birthYear: 2005,
        }, { db });

        assert.equal(typeof u.id, 'number');
        assert.equal(u.username, 'alice');
        assert.equal(u.email, null);          // 미입력 → NULL
        assert.equal(u.display_name, null);
        assert.equal(u.birth_year, 2005);
        assert.equal(u.password_hash, 'hash1');
        assert.equal(typeof u.created_at, 'number');
        assert.equal(u.last_login_at, null);

        const fetched = userService.findById(u.id, { db });
        assert.deepEqual(fetched, u);
    });

    it('이메일·display_name 포함 생성', () => {
        const u = userService.createUser({
            username: 'bob',
            email: 'bob@example.com',
            passwordHash: 'hash2',
            birthYear: 2000,
            displayName: '밥',
        }, { db });

        assert.equal(u.email, 'bob@example.com');
        assert.equal(u.display_name, '밥');
    });

    it('빈 문자열 이메일은 NULL로 정규화 (UNIQUE 충돌 회피)', () => {
        userService.createUser({ username: 'a', email: '', passwordHash: 'h', birthYear: 2000 }, { db });
        userService.createUser({ username: 'b', email: '   ', passwordHash: 'h', birthYear: 2000 }, { db });
        // 둘 다 NULL이라 충돌 없이 들어감 (SQLite UNIQUE는 NULL 다중 허용)
        assert.equal(userService.findByUsername('a', { db }).email, null);
        assert.equal(userService.findByUsername('b', { db }).email, null);
    });
});

describe('userService 중복 거부', () => {
    it('username 중복은 SQLite UNIQUE 위반 throw', () => {
        userService.createUser({ username: 'dup', passwordHash: 'h', birthYear: 2000 }, { db });
        assert.throws(
            () => userService.createUser({ username: 'dup', passwordHash: 'h2', birthYear: 2001 }, { db }),
            /UNIQUE constraint failed: users\.username/
        );
    });

    it('email 중복(둘 다 입력된 경우)도 거부', () => {
        userService.createUser({ username: 'a', email: 'x@y.com', passwordHash: 'h', birthYear: 2000 }, { db });
        assert.throws(
            () => userService.createUser({ username: 'b', email: 'x@y.com', passwordHash: 'h', birthYear: 2000 }, { db }),
            /UNIQUE constraint failed: users\.email/
        );
    });
});

describe('userService.findByUsername / findByEmail', () => {
    it('존재하지 않으면 null', () => {
        assert.equal(userService.findByUsername('nope', { db }), null);
        assert.equal(userService.findByEmail('nope@x.com', { db }), null);
    });

    it('findByEmail은 빈 문자열·NULL 입력에 항상 null', () => {
        userService.createUser({ username: 'a', passwordHash: 'h', birthYear: 2000 }, { db });
        assert.equal(userService.findByEmail('', { db }), null);
        assert.equal(userService.findByEmail(null, { db }), null);
        assert.equal(userService.findByEmail(undefined, { db }), null);
    });

    it('정상 이메일은 정확히 1건 조회', () => {
        const created = userService.createUser({
            username: 'c', email: 'c@x.com', passwordHash: 'h', birthYear: 2000,
        }, { db });
        const found = userService.findByEmail('c@x.com', { db });
        assert.equal(found.id, created.id);
    });
});

describe('userService.updateLastLogin', () => {
    it('last_login_at이 갱신됨', () => {
        const u = userService.createUser({ username: 'a', passwordHash: 'h', birthYear: 2000 }, { db });
        assert.equal(u.last_login_at, null);

        userService.updateLastLogin(u.id, { db });

        const after = userService.findById(u.id, { db });
        assert.equal(typeof after.last_login_at, 'number');
        // 생성 직후 갱신했으니 created_at과 같거나 1초 이내 차이
        assert.ok(Math.abs(after.last_login_at - after.created_at) <= 1);
    });

    it('존재하지 않는 id 갱신은 silently no-op', () => {
        // SQLite UPDATE는 매칭 없으면 0 row 영향 → 에러 X
        assert.doesNotThrow(() => userService.updateLastLogin(99999, { db }));
    });
});

describe('userService.stripSecret', () => {
    it('password_hash 제거', () => {
        const u = userService.createUser({ username: 'a', passwordHash: 'secret', birthYear: 2000 }, { db });
        const safe = userService.stripSecret(u);
        assert.equal(safe.password_hash, undefined);
        assert.equal(safe.username, 'a');
        assert.equal(safe.id, u.id);
    });

    it('null 입력은 null 반환', () => {
        assert.equal(userService.stripSecret(null), null);
        assert.equal(userService.stripSecret(undefined), null);
    });
});

