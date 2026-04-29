'use strict';

// authService 단위 테스트.
// - 검증 함수: 외부 의존성 없이 순수
// - signup/login: in-memory DB로 격리

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { getDb } = require('../src/db/init');
const auth = require('../src/services/authService');
const userService = require('../src/services/userService');

let db;
beforeEach(() => {
    db = getDb({ path: ':memory:' });
});

describe('validateUsername', () => {
    it('영문/숫자/_ 3-20자 통과', () => {
        for (const ok of ['abc', 'user_1', 'A1B2C3', '___', 'a'.repeat(20)]) {
            assert.equal(auth.validateUsername(ok), null, `accept ${ok}`);
        }
    });
    it('너무 짧거나 길면 거부', () => {
        assert.match(auth.validateUsername('ab'), /3~20자/);
        assert.match(auth.validateUsername('a'.repeat(21)), /3~20자/);
    });
    it('한글·공백·특수문자 거부', () => {
        assert.ok(auth.validateUsername('홍길동'));
        assert.ok(auth.validateUsername('user 1'));
        assert.ok(auth.validateUsername('user-1'));
        assert.ok(auth.validateUsername('user!'));
    });
    it('비-문자열 거부', () => {
        assert.ok(auth.validateUsername(123));
        assert.ok(auth.validateUsername(null));
        assert.ok(auth.validateUsername(undefined));
    });
});

describe('validateEmail', () => {
    it('빈/null/undefined는 OK (선택 입력)', () => {
        assert.equal(auth.validateEmail(undefined), null);
        assert.equal(auth.validateEmail(null), null);
        assert.equal(auth.validateEmail(''), null);
        assert.equal(auth.validateEmail('   '), null);
    });
    it('정상 이메일 통과', () => {
        for (const ok of ['a@b.com', 'user.name+tag@sub.example.kr']) {
            assert.equal(auth.validateEmail(ok), null);
        }
    });
    it('형식 불량 거부', () => {
        for (const bad of [
            'no-at', 'no@dot', '@start.com', 'space here@x.com',
            'a@b.c',          // TLD 1자
            'x@y',            // 점 자체 없음
            'a@b..com',       // 도메인 연속 점
            'a@.com',         // 도메인 점 시작
        ]) {
            assert.ok(auth.validateEmail(bad), `reject ${bad}`);
        }
    });
});

describe('validatePassword', () => {
    it('영문+숫자 8자 이상 통과', () => {
        assert.equal(auth.validatePassword('abcd1234'), null);
        assert.equal(auth.validatePassword('Pa55word'), null);
        assert.equal(auth.validatePassword('a1' + 'x'.repeat(6)), null);
    });
    it('8자 미만 거부', () => {
        assert.match(auth.validatePassword('a1b2c3d'), /8자 이상/);
    });
    it('영문 없음 거부', () => {
        assert.match(auth.validatePassword('12345678'), /영문/);
    });
    it('숫자 없음 거부', () => {
        assert.match(auth.validatePassword('abcdefgh'), /숫자/);
    });
    it('128자 초과 거부', () => {
        assert.ok(auth.validatePassword('a1' + 'x'.repeat(127)));
    });
});

describe('validateBirthYear', () => {
    const fixedNow = new Date('2026-04-26');
    it('14세 이상 통과 (2026년 기준 2012년 이전)', () => {
        assert.equal(auth.validateBirthYear(2012, fixedNow), null);
        assert.equal(auth.validateBirthYear(2000, fixedNow), null);
        assert.equal(auth.validateBirthYear(1990, fixedNow), null);
    });
    it('14세 미만 거부 (2026 - 2013 = 13)', () => {
        assert.match(auth.validateBirthYear(2013, fixedNow), /14세 이상/);
    });
    it('정수 아님 거부', () => {
        assert.ok(auth.validateBirthYear(2000.5, fixedNow));
        assert.ok(auth.validateBirthYear('2000', fixedNow));
    });
    it('1900 미만 / 미래 거부', () => {
        assert.ok(auth.validateBirthYear(1899, fixedNow));
        assert.ok(auth.validateBirthYear(2027, fixedNow));
    });
});

describe('signup (성공)', () => {
    it('필수만 → 사용자 생성, password_hash 미노출', async () => {
        const u = await auth.signup({
            username: 'alice',
            password: 'abcd1234',
            birthYear: 2005,
        }, { db });

        assert.equal(u.username, 'alice');
        assert.equal(u.email, null);
        assert.equal(u.password_hash, undefined); // stripped
        assert.equal(typeof u.id, 'number');
    });

    it('이메일 + display_name 포함', async () => {
        const u = await auth.signup({
            username: 'bob',
            email: 'bob@x.com',
            password: 'abcd1234',
            birthYear: 2005,
            displayName: '밥',
        }, { db });
        assert.equal(u.email, 'bob@x.com');
        assert.equal(u.display_name, '밥');
    });

    it('DB에 bcrypt 해시가 저장됨 (평문 X)', async () => {
        const created = await auth.signup({
            username: 'carol',
            password: 'abcd1234',
            birthYear: 2000,
        }, { db });
        const raw = userService.findById(created.id, { db });
        assert.notEqual(raw.password_hash, 'abcd1234');
        assert.match(raw.password_hash, /^\$2[aby]\$/); // bcrypt prefix
    });
});

describe('signup (실패)', () => {
    it('username 검증 실패 → AuthError VALIDATION', async () => {
        await assert.rejects(
            auth.signup({ username: 'ab', password: 'abcd1234', birthYear: 2005 }, { db }),
            (e) => e instanceof auth.AuthError && e.code === 'VALIDATION' && /username/.test(e.message)
        );
    });

    it('14세 미만 → VALIDATION (birthYear 사유)', async () => {
        await assert.rejects(
            auth.signup({ username: 'kid', password: 'abcd1234', birthYear: 2020 }, { db }),
            (e) => e.code === 'VALIDATION' && /14세/.test(e.message)
        );
    });

    it('username 중복 → CONFLICT', async () => {
        await auth.signup({ username: 'dup', password: 'abcd1234', birthYear: 2000 }, { db });
        await assert.rejects(
            auth.signup({ username: 'dup', password: 'xyzw5678', birthYear: 2000 }, { db }),
            (e) => e.code === 'CONFLICT'
        );
    });

    it('email 중복 → CONFLICT', async () => {
        await auth.signup({ username: 'usera', email: 'x@y.com', password: 'abcd1234', birthYear: 2000 }, { db });
        await assert.rejects(
            auth.signup({ username: 'userb', email: 'x@y.com', password: 'abcd1234', birthYear: 2000 }, { db }),
            (e) => e.code === 'CONFLICT'
        );
    });
});

describe('username case-insensitive', () => {
    it('signup이 username을 lowercase로 저장', async () => {
        const u = await auth.signup({
            username: 'MixedCase',
            password: 'abcd1234',
            birthYear: 2000,
        }, { db });
        assert.equal(u.username, 'mixedcase');
    });

    it('대소문자만 다른 username으로 재가입 시 CONFLICT', async () => {
        await auth.signup({ username: 'caseDup', password: 'abcd1234', birthYear: 2000 }, { db });
        await assert.rejects(
            auth.signup({ username: 'CASEDUP', password: 'xyzw5678', birthYear: 2000 }, { db }),
            (e) => e.code === 'CONFLICT'
        );
    });

    it('다른 대소문자로도 로그인 성공', async () => {
        await auth.signup({ username: 'caseLogin', password: 'abcd1234', birthYear: 2000 }, { db });
        const u = await auth.login({ username: 'CASELOGIN', password: 'abcd1234' }, { db });
        assert.equal(u.username, 'caselogin');
    });

    it('findByUsername도 case-insensitive', async () => {
        await auth.signup({ username: 'finder', password: 'abcd1234', birthYear: 2000 }, { db });
        assert.ok(userService.findByUsername('FINDER', { db }));
        assert.ok(userService.findByUsername('Finder', { db }));
    });
});

describe('login', () => {
    beforeEach(async () => {
        await auth.signup({
            username: 'logu', password: 'abcd1234', birthYear: 2000,
        }, { db });
    });

    it('올바른 자격증명 → user 반환 + last_login_at 갱신', async () => {
        const before = userService.findByUsername('logu', { db });
        assert.equal(before.last_login_at, null);

        const u = await auth.login({ username: 'logu', password: 'abcd1234' }, { db });
        assert.equal(u.username, 'logu');
        assert.equal(u.password_hash, undefined);

        const after = userService.findByUsername('logu', { db });
        assert.equal(typeof after.last_login_at, 'number');
    });

    it('비밀번호 틀림 → INVALID_CREDENTIALS', async () => {
        await assert.rejects(
            auth.login({ username: 'logu', password: 'wrong000' }, { db }),
            (e) => e.code === 'INVALID_CREDENTIALS'
        );
    });

    it('존재하지 않는 username도 같은 에러로 응답 (정보 누설 방지)', async () => {
        await assert.rejects(
            auth.login({ username: 'nope', password: 'abcd1234' }, { db }),
            (e) => e.code === 'INVALID_CREDENTIALS'
        );
    });

    it('비-문자열 입력 → INVALID_CREDENTIALS', async () => {
        await assert.rejects(
            auth.login({ username: null, password: 'abcd1234' }, { db }),
            (e) => e.code === 'INVALID_CREDENTIALS'
        );
    });
});
