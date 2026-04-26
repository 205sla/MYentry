'use strict';

// /api/auth/* 통합 테스트 + 미들웨어 단위 테스트.
// - 임시 파일 DB로 격리 (DB_PATH를 require 전에 override)
// - MemoryStore로 세션 격리
// - disableRateLimit으로 rate-limit 우회

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const session = require('express-session');

// 임시 DB 디렉터리 — config가 require되기 전에 반드시 설정.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code205-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const createApp = require('../src/app');
const { getDb, closeDb } = require('../src/db/init');

let server;
let baseUrl;

before(async () => {
    const app = createApp({
        sessionStore: new session.MemoryStore(),
        disableRateLimit: true,
    });
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDb(process.env.DB_PATH);
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* WAL 락이 늦게 풀려도 무해 */ }
});

beforeEach(() => {
    // 매 테스트마다 사용자 테이블 초기화 (id 시퀀스도 리셋)
    const db = getDb();
    db.exec('DELETE FROM users; DELETE FROM sqlite_sequence WHERE name=\'users\';');
});

// ─────── fetch helper ───────
async function call(method, urlPath, body, cookieIn = '') {
    const headers = {};
    if (cookieIn) headers.Cookie = cookieIn;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(baseUrl + urlPath, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const setCookies = res.headers.getSetCookie?.() || [];
    const cookie = setCookies.length
        ? setCookies.map((c) => c.split(';')[0]).join('; ')
        : cookieIn;

    const text = await res.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* 본문이 비-JSON일 수 있음 */ }

    return { status: res.status, body: parsed, cookie };
}

// ═══════════════════════════════════════════
//   통합: POST /api/auth/signup
// ═══════════════════════════════════════════
describe('POST /api/auth/signup', () => {
    it('정상 가입: 201 + user + 자동 로그인 쿠키', async () => {
        const r = await call('POST', '/api/auth/signup', {
            username: 'alice', password: 'abcd1234', birthYear: 2000,
        });
        assert.equal(r.status, 201);
        assert.equal(r.body.user.username, 'alice');
        assert.equal(r.body.user.password_hash, undefined);
        assert.match(r.cookie, /^code205\.sid=/);
    });

    it('username 중복: 409 CONFLICT', async () => {
        await call('POST', '/api/auth/signup', { username: 'dup', password: 'abcd1234', birthYear: 2000 });
        const r = await call('POST', '/api/auth/signup', { username: 'dup', password: 'xyzw5678', birthYear: 2000 });
        assert.equal(r.status, 409);
        assert.equal(r.body.error, 'CONFLICT');
    });

    it('14세 미만: 400 VALIDATION', async () => {
        const r = await call('POST', '/api/auth/signup', { username: 'kid', password: 'abcd1234', birthYear: 2020 });
        assert.equal(r.status, 400);
        assert.equal(r.body.error, 'VALIDATION');
        assert.match(r.body.message, /14세/);
    });

    it('비밀번호 정책 위반: 400 VALIDATION', async () => {
        const r = await call('POST', '/api/auth/signup', { username: 'pwuser', password: 'short1', birthYear: 2000 });
        assert.equal(r.status, 400);
        assert.equal(r.body.error, 'VALIDATION');
    });

    it('잘못된 username 패턴: 400 VALIDATION', async () => {
        const r = await call('POST', '/api/auth/signup', { username: '한글닉', password: 'abcd1234', birthYear: 2000 });
        assert.equal(r.status, 400);
    });
});

// ═══════════════════════════════════════════
//   통합: GET /api/auth/me
// ═══════════════════════════════════════════
describe('GET /api/auth/me', () => {
    it('비로그인: user: null', async () => {
        const r = await call('GET', '/api/auth/me');
        assert.equal(r.status, 200);
        assert.equal(r.body.user, null);
    });

    it('가입 직후 me는 가입한 사용자', async () => {
        const s = await call('POST', '/api/auth/signup', {
            username: 'meuser', password: 'abcd1234', birthYear: 2000, displayName: '미',
        });
        const r = await call('GET', '/api/auth/me', undefined, s.cookie);
        assert.equal(r.status, 200);
        assert.equal(r.body.user.username, 'meuser');
        assert.equal(r.body.user.display_name, '미');
    });
});

// ═══════════════════════════════════════════
//   통합: POST /api/auth/logout
// ═══════════════════════════════════════════
describe('POST /api/auth/logout', () => {
    it('로그아웃 후 me는 다시 null', async () => {
        const s = await call('POST', '/api/auth/signup', { username: 'lguser', password: 'abcd1234', birthYear: 2000 });
        const lo = await call('POST', '/api/auth/logout', undefined, s.cookie);
        assert.equal(lo.body.ok, true);
        const r = await call('GET', '/api/auth/me', undefined, lo.cookie);
        assert.equal(r.body.user, null);
    });

    it('비로그인 상태에서 logout도 200 (멱등)', async () => {
        const r = await call('POST', '/api/auth/logout');
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
    });
});

// ═══════════════════════════════════════════
//   통합: POST /api/auth/login
// ═══════════════════════════════════════════
describe('POST /api/auth/login', () => {
    beforeEach(async () => {
        await call('POST', '/api/auth/signup', { username: 'liuser', password: 'abcd1234', birthYear: 2000 });
    });

    it('정상: 200 + user + 새 세션 쿠키', async () => {
        const r = await call('POST', '/api/auth/login', { username: 'liuser', password: 'abcd1234' });
        assert.equal(r.status, 200);
        assert.equal(r.body.user.username, 'liuser');
        assert.match(r.cookie, /^code205\.sid=/);
    });

    it('비밀번호 틀림: 401 INVALID_CREDENTIALS', async () => {
        const r = await call('POST', '/api/auth/login', { username: 'liuser', password: 'wrong000' });
        assert.equal(r.status, 401);
        assert.equal(r.body.error, 'INVALID_CREDENTIALS');
    });

    it('존재하지 않는 username: 같은 401 (정보 누설 방지)', async () => {
        const r = await call('POST', '/api/auth/login', { username: 'nope', password: 'abcd1234' });
        assert.equal(r.status, 401);
        assert.equal(r.body.error, 'INVALID_CREDENTIALS');
    });
});

// ═══════════════════════════════════════════
//   미들웨어 단위: requireAuth / optionalAuth
// ═══════════════════════════════════════════
describe('requireAuth (단위)', () => {
    const { requireAuth } = require('../src/middleware/auth');
    const userService = require('../src/services/userService');

    function fakeRes() {
        const res = {};
        res.status = (s) => { res.statusCode = s; return res; };
        res.json = (b) => { res.body = b; return res; };
        return res;
    }

    it('비로그인 (session 없음): 401 UNAUTHORIZED', () => {
        const req = { session: {} };
        const res = fakeRes();
        let nextCalled = false;
        requireAuth(req, res, () => { nextCalled = true; });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error, 'UNAUTHORIZED');
        assert.equal(nextCalled, false);
    });

    it('로그인 + DB 사용자 존재: next 호출 + req.user 채워짐', () => {
        const created = userService.createUser({ username: 'reqauth1', passwordHash: 'h', birthYear: 2000 });
        const req = { session: { userId: created.id } };
        let nextCalled = false;
        requireAuth(req, fakeRes(), () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(req.user.username, 'reqauth1');
        assert.equal(req.user.password_hash, undefined); // stripped
    });

    it('세션은 있지만 DB 사용자 사라짐: 401', () => {
        const req = { session: { userId: 99999 } };
        const res = fakeRes();
        requireAuth(req, res, () => {});
        assert.equal(res.statusCode, 401);
    });
});

describe('optionalAuth (단위)', () => {
    const { optionalAuth } = require('../src/middleware/auth');
    const userService = require('../src/services/userService');

    it('비로그인: next + req.user = null', () => {
        const req = { session: {} };
        let nextCalled = false;
        optionalAuth(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(req.user, null);
    });

    it('로그인: next + req.user 채워짐', () => {
        const created = userService.createUser({ username: 'optauth1', passwordHash: 'h', birthYear: 2000 });
        const req = { session: { userId: created.id } };
        let nextCalled = false;
        optionalAuth(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(req.user.username, 'optauth1');
    });
});
