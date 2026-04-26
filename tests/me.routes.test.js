'use strict';

// /api/me/* 통합 테스트.
// auth.routes.test.js와 같은 패턴 (임시 DB + MemoryStore + disableRateLimit).

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const session = require('express-session');

// DB_PATH를 require 전에 override
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code205-me-test-'));
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
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDb(process.env.DB_PATH);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* WAL 락 무해 */ }
});

beforeEach(() => {
    const db = getDb();
    db.exec(`
        DELETE FROM solutions;
        DELETE FROM users;
        DELETE FROM sqlite_sequence WHERE name='users';
    `);
});

// 가입 후 cookie 반환
async function signupAndGetCookie(username) {
    const r = await fetch(baseUrl + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'abcd1234', birthYear: 2000 }),
    });
    const setCookies = r.headers.getSetCookie?.() || [];
    return setCookies.map((c) => c.split(';')[0]).join('; ');
}

async function call(method, urlPath, cookieIn) {
    const headers = {};
    if (cookieIn) headers.Cookie = cookieIn;
    const r = await fetch(baseUrl + urlPath, { method, headers });
    let body = await r.text();
    try { body = JSON.parse(body); } catch { /* */ }
    return { status: r.status, body };
}

// ═══════════════════════════════════════════
//   인증 가드
// ═══════════════════════════════════════════
describe('/api/me/* 인증 가드', () => {
    it('GET /solved: 비로그인 → 401', async () => {
        const r = await call('GET', '/api/me/solved');
        assert.equal(r.status, 401);
        assert.equal(r.body.error, 'UNAUTHORIZED');
    });

    it('POST /solved/:id: 비로그인 → 401', async () => {
        const r = await call('POST', '/api/me/solved/001');
        assert.equal(r.status, 401);
    });

    it('DELETE /solved/:id: 비로그인 → 401', async () => {
        const r = await call('DELETE', '/api/me/solved/001');
        assert.equal(r.status, 401);
    });
});

// ═══════════════════════════════════════════
//   GET /api/me/solved
// ═══════════════════════════════════════════
describe('GET /api/me/solved', () => {
    it('가입 직후 빈 배열', async () => {
        const c = await signupAndGetCookie('alice1');
        const r = await call('GET', '/api/me/solved', c);
        assert.equal(r.status, 200);
        assert.deepEqual(r.body, { problems: [] });
    });
});

// ═══════════════════════════════════════════
//   POST /api/me/solved/:problemId
// ═══════════════════════════════════════════
describe('POST /api/me/solved/:problemId', () => {
    it('첫 등록 → 201 created:true', async () => {
        const c = await signupAndGetCookie('alice2');
        const r = await call('POST', '/api/me/solved/001', c);
        assert.equal(r.status, 201);
        assert.equal(r.body.ok, true);
        assert.equal(r.body.created, true);
    });

    it('중복 등록 → 200 created:false', async () => {
        const c = await signupAndGetCookie('alice3');
        await call('POST', '/api/me/solved/001', c);
        const r = await call('POST', '/api/me/solved/001', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.created, false);
    });

    it('잘못된 형식 (영문) → 404', async () => {
        const c = await signupAndGetCookie('alice4');
        const r = await call('POST', '/api/me/solved/abc', c);
        assert.equal(r.status, 404);
        assert.equal(r.body.error, 'NOT_FOUND');
    });

    it('존재하지 않는 problem_id → 404', async () => {
        const c = await signupAndGetCookie('alice5');
        // 9999는 없는 문제로 가정
        const r = await call('POST', '/api/me/solved/9999', c);
        assert.equal(r.status, 404);
    });

    it('등록 후 GET에 반영됨', async () => {
        const c = await signupAndGetCookie('alice6');
        await call('POST', '/api/me/solved/1', c);   // padId → "001"
        await call('POST', '/api/me/solved/3', c);   // padId → "003"
        const r = await call('GET', '/api/me/solved', c);
        assert.deepEqual(r.body.problems, ['001', '003']);
    });
});

// ═══════════════════════════════════════════
//   DELETE /api/me/solved/:problemId
// ═══════════════════════════════════════════
describe('DELETE /api/me/solved/:problemId', () => {
    it('등록된 항목 제거 → ok:true, removed:true', async () => {
        const c = await signupAndGetCookie('alice7');
        await call('POST', '/api/me/solved/001', c);
        const r = await call('DELETE', '/api/me/solved/001', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.removed, true);

        // 사라졌는지 확인
        const after = await call('GET', '/api/me/solved', c);
        assert.deepEqual(after.body.problems, []);
    });

    it('없는 항목 제거 → ok:true, removed:false (멱등)', async () => {
        const c = await signupAndGetCookie('alice8');
        const r = await call('DELETE', '/api/me/solved/999', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.removed, false);
    });
});

// ═══════════════════════════════════════════
//   격리: 사용자별 독립
// ═══════════════════════════════════════════
describe('사용자 간 격리', () => {
    it('A의 등록은 B에게 안 보임', async () => {
        const a = await signupAndGetCookie('userA');
        const b = await signupAndGetCookie('userB');
        await call('POST', '/api/me/solved/001', a);

        const aGet = await call('GET', '/api/me/solved', a);
        const bGet = await call('GET', '/api/me/solved', b);
        assert.deepEqual(aGet.body.problems, ['001']);
        assert.deepEqual(bGet.body.problems, []);
    });
});

// ═══════════════════════════════════════════
//   GET /api/me (alias of /api/auth/me)
// ═══════════════════════════════════════════
describe('GET /api/me', () => {
    it('비로그인: 401', async () => {
        const r = await call('GET', '/api/me');
        assert.equal(r.status, 401);
    });
    it('로그인: user 반환 (password_hash 없음)', async () => {
        const c = await signupAndGetCookie('meuser1');
        const r = await call('GET', '/api/me', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.user.username, 'meuser1');
        assert.equal(r.body.user.password_hash, undefined);
    });
});

// ═══════════════════════════════════════════
//   PATCH /api/me — 부분 업데이트
// ═══════════════════════════════════════════
async function callJson(method, urlPath, body, cookieIn) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookieIn) headers.Cookie = cookieIn;
    const r = await fetch(baseUrl + urlPath, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let parsed;
    const text = await r.text();
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: r.status, body: parsed };
}

describe('PATCH /api/me', () => {
    it('이메일·표시이름 갱신', async () => {
        const c = await signupAndGetCookie('patchu1');
        const r = await callJson('PATCH', '/api/me', { email: 'new@x.com', displayName: '새이름' }, c);
        assert.equal(r.status, 200);
        assert.equal(r.body.user.email, 'new@x.com');
        assert.equal(r.body.user.display_name, '새이름');
    });

    it('이메일 빈 문자열 → NULL 회귀', async () => {
        const c = await signupAndGetCookie('patchu2');
        await callJson('PATCH', '/api/me', { email: 'tmp@x.com' }, c);
        const r = await callJson('PATCH', '/api/me', { email: '' }, c);
        assert.equal(r.body.user.email, null);
    });

    it('빈 patch: 400 VALIDATION', async () => {
        const c = await signupAndGetCookie('patchu3');
        const r = await callJson('PATCH', '/api/me', {}, c);
        assert.equal(r.status, 400);
    });

    it('잘못된 이메일 형식: 400', async () => {
        const c = await signupAndGetCookie('patchu4');
        const r = await callJson('PATCH', '/api/me', { email: 'bad-no-at' }, c);
        assert.equal(r.status, 400);
        assert.match(r.body.message, /email/);
    });

    it('이미 사용 중인 이메일: 409 CONFLICT', async () => {
        const a = await signupAndGetCookie('patchu5a');
        const b = await signupAndGetCookie('patchu5b');
        await callJson('PATCH', '/api/me', { email: 'shared@x.com' }, a);
        const r = await callJson('PATCH', '/api/me', { email: 'shared@x.com' }, b);
        assert.equal(r.status, 409);
        assert.equal(r.body.error, 'CONFLICT');
    });

    it('비로그인: 401', async () => {
        const r = await callJson('PATCH', '/api/me', { email: 'x@y.com' });
        assert.equal(r.status, 401);
    });
});

// ═══════════════════════════════════════════
//   POST /api/me/password
// ═══════════════════════════════════════════
describe('POST /api/me/password', () => {
    it('정상 변경: 200', async () => {
        const c = await signupAndGetCookie('pwu1');
        const r = await callJson('POST', '/api/me/password', {
            currentPassword: 'abcd1234',
            newPassword: 'xyz98765',
        }, c);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);

        // 새 비밀번호로 재로그인 가능
        const login = await callJson('POST', '/api/auth/login', { username: 'pwu1', password: 'xyz98765' });
        assert.equal(login.status, 200);
    });

    it('현재 비밀번호 틀림: 401 INVALID_CREDENTIALS', async () => {
        const c = await signupAndGetCookie('pwu2');
        const r = await callJson('POST', '/api/me/password', {
            currentPassword: 'wrong',
            newPassword: 'xyz98765',
        }, c);
        assert.equal(r.status, 401);
    });

    it('새 비밀번호 정책 위반: 400 VALIDATION', async () => {
        const c = await signupAndGetCookie('pwu3');
        const r = await callJson('POST', '/api/me/password', {
            currentPassword: 'abcd1234',
            newPassword: 'short',
        }, c);
        assert.equal(r.status, 400);
        assert.equal(r.body.error, 'VALIDATION');
    });

    it('비로그인: 401', async () => {
        const r = await callJson('POST', '/api/me/password', { currentPassword: 'a', newPassword: 'abcd1234' });
        assert.equal(r.status, 401);
    });
});

// ═══════════════════════════════════════════
//   DELETE /api/me
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
//   /api/me/submissions/* (Phase 3.3)
// ═══════════════════════════════════════════
describe('POST /api/me/submissions/:problemId', () => {
    it('비로그인: 401', async () => {
        const r = await callJson('POST', '/api/me/submissions/001', { code: '{}' });
        assert.equal(r.status, 401);
    });

    it('첫 저장: 201 created:true', async () => {
        const c = await signupAndGetCookie('subu1');
        const r = await callJson('POST', '/api/me/submissions/001', { code: '{"hello":1}' }, c);
        assert.equal(r.status, 201);
        assert.equal(r.body.created, true);
    });

    it('재저장: 200 created:false (덮어쓰기)', async () => {
        const c = await signupAndGetCookie('subu2');
        await callJson('POST', '/api/me/submissions/001', { code: 'old' }, c);
        const r = await callJson('POST', '/api/me/submissions/001', { code: 'new' }, c);
        assert.equal(r.status, 200);
        assert.equal(r.body.created, false);

        // 실제 덮어쓰기 확인
        const get = await callJson('GET', '/api/me/submissions/001', undefined, c);
        assert.equal(get.body.code, 'new');
    });

    it('잘못된 problem_id (영문): 404', async () => {
        const c = await signupAndGetCookie('subu3');
        const r = await callJson('POST', '/api/me/submissions/abc', { code: 'x' }, c);
        assert.equal(r.status, 404);
    });

    it('존재하지 않는 problem_id: 404', async () => {
        const c = await signupAndGetCookie('subu4');
        const r = await callJson('POST', '/api/me/submissions/9999', { code: 'x' }, c);
        assert.equal(r.status, 404);
    });

    it('빈 code: 400 VALIDATION', async () => {
        const c = await signupAndGetCookie('subu5');
        const r = await callJson('POST', '/api/me/submissions/001', { code: '' }, c);
        assert.equal(r.status, 400);
        assert.equal(r.body.error, 'VALIDATION');
    });

    it('code 누락: 400', async () => {
        const c = await signupAndGetCookie('subu6');
        const r = await callJson('POST', '/api/me/submissions/001', {}, c);
        assert.equal(r.status, 400);
    });

    it('100KB 초과: 413 PAYLOAD_TOO_LARGE', async () => {
        const c = await signupAndGetCookie('subu7');
        const big = 'a'.repeat(110 * 1024); // 110KB
        const r = await callJson('POST', '/api/me/submissions/001', { code: big }, c);
        // body parser가 먼저 차단하면 413 with 'PayloadTooLarge', 라우트가 차단하면 우리 형식
        // 둘 다 status 413이어야 함
        assert.equal(r.status, 413);
    });
});

describe('GET /api/me/submissions', () => {
    it('비로그인: 401', async () => {
        const r = await call('GET', '/api/me/submissions');
        assert.equal(r.status, 401);
    });

    it('빈 사용자: { submissions: [] }', async () => {
        const c = await signupAndGetCookie('subu8');
        const r = await call('GET', '/api/me/submissions', c);
        assert.equal(r.status, 200);
        assert.deepEqual(r.body, { submissions: [] });
    });

    it('저장 후 목록: code 본문 제외, code_size만', async () => {
        const c = await signupAndGetCookie('subu9');
        await callJson('POST', '/api/me/submissions/001', { code: 'hello world' }, c);
        await callJson('POST', '/api/me/submissions/3', { code: '{"a":1}' }, c); // padId → "003"

        const r = await call('GET', '/api/me/submissions', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.submissions.length, 2);
        r.body.submissions.forEach((s) => {
            assert.equal(s.code, undefined);
            assert.ok(typeof s.problem_id === 'string');
            assert.ok(s.code_size >= 1);
        });
    });
});

describe('GET /api/me/submissions/:problemId', () => {
    it('없음: 404', async () => {
        const c = await signupAndGetCookie('subu10');
        const r = await call('GET', '/api/me/submissions/001', c);
        assert.equal(r.status, 404);
    });

    it('있음: 전체 코드 + 메타 반환', async () => {
        const c = await signupAndGetCookie('subu11');
        await callJson('POST', '/api/me/submissions/001', { code: '{"foo":42}' }, c);
        const r = await call('GET', '/api/me/submissions/001', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.problem_id, '001');
        assert.equal(r.body.code, '{"foo":42}');
        assert.ok(r.body.submitted_at > 0);
    });

    it('잘못된 형식 (영문): 404', async () => {
        const c = await signupAndGetCookie('subu12');
        const r = await call('GET', '/api/me/submissions/abc', c);
        assert.equal(r.status, 404);
    });
});

describe('DELETE /api/me/submissions/:problemId', () => {
    it('등록된 항목 제거: ok + removed:true', async () => {
        const c = await signupAndGetCookie('subu13');
        await callJson('POST', '/api/me/submissions/001', { code: 'x' }, c);
        const del = await call('DELETE', '/api/me/submissions/001', c);
        assert.equal(del.status, 200);
        assert.equal(del.body.removed, true);

        const get = await call('GET', '/api/me/submissions/001', c);
        assert.equal(get.status, 404);
    });

    it('없는 항목 제거: removed:false (멱등)', async () => {
        const c = await signupAndGetCookie('subu14');
        const r = await call('DELETE', '/api/me/submissions/999', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.removed, false);
    });
});

describe('DELETE /api/me/submissions (전체)', () => {
    it('비로그인: 401', async () => {
        const r = await call('DELETE', '/api/me/submissions');
        assert.equal(r.status, 401);
    });

    it('여러 개 등록 후 전체 삭제 → ok + removed 개수', async () => {
        const c = await signupAndGetCookie('subuClearAll');
        await callJson('POST', '/api/me/submissions/001', { code: 'a' }, c);
        await callJson('POST', '/api/me/submissions/3',   { code: 'b' }, c);

        const r = await call('DELETE', '/api/me/submissions', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.equal(r.body.removed, 2);

        const list = await call('GET', '/api/me/submissions', c);
        assert.deepEqual(list.body.submissions, []);
    });

    it('빈 상태에서 호출: ok + removed:0 (멱등)', async () => {
        const c = await signupAndGetCookie('subuClearEmpty');
        const r = await call('DELETE', '/api/me/submissions', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.removed, 0);
    });

    it('A의 전체 삭제는 B에게 영향 없음', async () => {
        const a = await signupAndGetCookie('subuClearA');
        const b = await signupAndGetCookie('subuClearB');
        await callJson('POST', '/api/me/submissions/001', { code: 'a' }, a);
        await callJson('POST', '/api/me/submissions/001', { code: 'b' }, b);

        await call('DELETE', '/api/me/submissions', a);

        const aList = await call('GET', '/api/me/submissions', a);
        const bList = await call('GET', '/api/me/submissions', b);
        assert.equal(aList.body.submissions.length, 0);
        assert.equal(bList.body.submissions.length, 1);
    });
});

describe('DELETE /api/me/solved (전체)', () => {
    it('비로그인: 401', async () => {
        const r = await call('DELETE', '/api/me/solved');
        assert.equal(r.status, 401);
    });

    it('여러 개 등록 후 전체 삭제 → ok + removed 개수', async () => {
        const c = await signupAndGetCookie('solvClearAll');
        await call('POST', '/api/me/solved/001', c);
        await call('POST', '/api/me/solved/003', c);
        await call('POST', '/api/me/solved/006', c);

        const r = await call('DELETE', '/api/me/solved', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.equal(r.body.removed, 3);

        const list = await call('GET', '/api/me/solved', c);
        assert.deepEqual(list.body.problems, []);
    });

    it('빈 상태에서 호출: ok + removed:0 (멱등)', async () => {
        const c = await signupAndGetCookie('solvClearEmpty');
        const r = await call('DELETE', '/api/me/solved', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.removed, 0);
    });

    it('단건 DELETE /solved/:id가 여전히 작동 (라우트 우선순위)', async () => {
        const c = await signupAndGetCookie('solvSingleStill');
        await call('POST', '/api/me/solved/001', c);
        await call('POST', '/api/me/solved/003', c);
        // 단건 삭제
        const r = await call('DELETE', '/api/me/solved/001', c);
        assert.equal(r.status, 200);
        assert.equal(r.body.removed, true);
        // 003은 살아있어야 함
        const list = await call('GET', '/api/me/solved', c);
        assert.deepEqual(list.body.problems, ['003']);
    });
});

describe('submissions 사용자 간 격리', () => {
    it('A의 제출은 B에게 안 보임', async () => {
        const a = await signupAndGetCookie('subuA');
        const b = await signupAndGetCookie('subuB');
        await callJson('POST', '/api/me/submissions/001', { code: 'a-code' }, a);

        const aGet = await call('GET', '/api/me/submissions/001', a);
        const bGet = await call('GET', '/api/me/submissions/001', b);
        assert.equal(aGet.body.code, 'a-code');
        assert.equal(bGet.status, 404);
    });
});

describe('계정 삭제 시 submissions 자동 정리 (CASCADE)', () => {
    it('DELETE /api/me 후 같은 username 재가입 → submissions 비어있음', async () => {
        const c = await signupAndGetCookie('subuDel');
        await callJson('POST', '/api/me/submissions/001', { code: 'will-be-deleted' }, c);
        await callJson('DELETE', '/api/me', { password: 'abcd1234' }, c);

        // 같은 username 재가입
        const c2 = await signupAndGetCookie('subuDel');
        const list = await call('GET', '/api/me/submissions', c2);
        assert.deepEqual(list.body.submissions, []);
    });
});

describe('DELETE /api/me', () => {
    it('정상 삭제 + solutions 자동 정리 + 세션 종료', async () => {
        const c = await signupAndGetCookie('delu1');
        await callJson('POST', '/api/me/solved/001', undefined, c);

        // 삭제 전 solved 확인
        const before = await call('GET', '/api/me/solved', c);
        assert.deepEqual(before.body.problems, ['001']);

        // 삭제
        const del = await callJson('DELETE', '/api/me', { password: 'abcd1234' }, c);
        assert.equal(del.status, 200);
        assert.equal(del.body.ok, true);

        // 같은 쿠키로 me 호출 → 401 (세션 종료됨)
        const after = await call('GET', '/api/me', c);
        assert.equal(after.status, 401);

        // 같은 username으로 재가입 가능 (DB에서 사라짐)
        const re = await callJson('POST', '/api/auth/signup', {
            username: 'delu1', password: 'newp1234', birthYear: 2000,
        });
        assert.equal(re.status, 201);
    });

    it('비밀번호 틀림: 401 INVALID_CREDENTIALS, 계정 유지', async () => {
        const c = await signupAndGetCookie('delu2');
        const r = await callJson('DELETE', '/api/me', { password: 'wrong' }, c);
        assert.equal(r.status, 401);

        // 계정 살아있는지 확인
        const me = await call('GET', '/api/me', c);
        assert.equal(me.status, 200);
        assert.equal(me.body.user.username, 'delu2');
    });

    it('비밀번호 누락: 401', async () => {
        const c = await signupAndGetCookie('delu3');
        const r = await callJson('DELETE', '/api/me', {}, c);
        assert.equal(r.status, 401);
    });

    it('비로그인: 401', async () => {
        const r = await callJson('DELETE', '/api/me', { password: 'x' });
        assert.equal(r.status, 401);
    });
});
