// 인증 비즈니스 로직.
// - 입력 검증 (username·password·email·birth_year)
// - bcrypt hash/verify (bcryptjs는 pure-JS라 빌드 도구 없이도 동작)
// - signup / login (DB는 userService 경유)
//
// 라우트는 이 모듈의 AuthError를 캐치해 HTTP 상태로 변환한다.

'use strict';

const bcrypt = require('bcryptjs');
const userService = require('./userService');

// ─────── 정책 상수 ───────
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_LETTER_RE = /[a-zA-Z]/;
const PASSWORD_DIGIT_RE = /[0-9]/;
const MIN_AGE = 14;
const BCRYPT_COST = 10;

// ─────── 에러 ───────
class AuthError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'AuthError';
        this.code = code; // 'VALIDATION' | 'CONFLICT' | 'INVALID_CREDENTIALS' | 'AGE_RESTRICTED'
    }
}

// ─────── 검증 ───────
function validateUsername(s) {
    if (typeof s !== 'string') return '아이디는 문자열이어야 합니다.';
    if (!USERNAME_RE.test(s)) {
        return '아이디는 영문·숫자·밑줄(_) 3~20자여야 합니다.';
    }
    return null;
}

function validateEmail(s) {
    // 빈 문자열·null·undefined → 선택 입력이라 OK
    if (s === undefined || s === null) return null;
    if (typeof s !== 'string') return '이메일은 문자열이어야 합니다.';
    if (s.trim() === '') return null;
    if (!EMAIL_RE.test(s.trim())) return '이메일 형식이 올바르지 않습니다.';
    if (s.length > 254) return '이메일이 너무 깁니다.';
    return null;
}

function validatePassword(s) {
    if (typeof s !== 'string') return '비밀번호는 문자열이어야 합니다.';
    if (s.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`;
    if (s.length > 128) return '비밀번호가 너무 깁니다.';
    if (!PASSWORD_LETTER_RE.test(s)) return '비밀번호에 영문이 1글자 이상 포함되어야 합니다.';
    if (!PASSWORD_DIGIT_RE.test(s)) return '비밀번호에 숫자가 1개 이상 포함되어야 합니다.';
    return null;
}

function validateBirthYear(year, now = new Date()) {
    if (!Number.isInteger(year)) return '출생 연도는 정수여야 합니다.';
    const currentYear = now.getFullYear();
    if (year < 1900 || year > currentYear) return '출생 연도가 올바르지 않습니다.';
    const age = currentYear - year;
    if (age < MIN_AGE) return `${MIN_AGE}세 이상만 가입할 수 있습니다.`;
    return null;
}

function validateDisplayName(s) {
    if (s === undefined || s === null) return null;
    if (typeof s !== 'string') return '표시 이름은 문자열이어야 합니다.';
    if (s.trim() === '') return null;
    if (s.length > 30) return '표시 이름은 30자 이하여야 합니다.';
    return null;
}

/**
 * 모든 가입 입력을 한 번에 검증.
 * 첫 번째 위반에서 즉시 AuthError throw.
 */
function assertValidSignup(input) {
    const checks = [
        ['username', validateUsername(input.username)],
        ['email', validateEmail(input.email)],
        ['password', validatePassword(input.password)],
        ['birthYear', validateBirthYear(input.birthYear)],
        ['displayName', validateDisplayName(input.displayName)],
    ];
    for (const [field, msg] of checks) {
        if (msg) throw new AuthError('VALIDATION', `${field}: ${msg}`);
    }
}

// ─────── 가입 ───────
/**
 * @param {object} input { username, email?, password, birthYear, displayName? }
 * @param {object} [opts] { db } 테스트 주입용
 * @returns {Promise<object>} stripSecret된 user
 * @throws {AuthError}
 */
async function signup(input, opts = {}) {
    assertValidSignup(input);

    // 친절한 중복 메시지를 위한 사전 체크 (race condition은 DB UNIQUE가 보강).
    if (userService.findByUsername(input.username, opts)) {
        throw new AuthError('CONFLICT', '이미 사용 중인 아이디입니다.');
    }
    if (input.email && input.email.trim() !== '') {
        if (userService.findByEmail(input.email, opts)) {
            throw new AuthError('CONFLICT', '이미 사용 중인 이메일입니다.');
        }
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    let created;
    try {
        created = userService.createUser({
            username: input.username,
            email: input.email,
            passwordHash,
            birthYear: input.birthYear,
            displayName: input.displayName,
        }, opts);
    } catch (e) {
        // 사전 체크와 createUser 사이의 race로 UNIQUE 위반 시
        if (/UNIQUE constraint failed/.test(e.message)) {
            throw new AuthError('CONFLICT', '이미 사용 중인 아이디 또는 이메일입니다.');
        }
        throw e;
    }

    return userService.stripSecret(created);
}

// ─────── 로그인 ───────
/**
 * @param {object} input { username, password }
 * @returns {Promise<object>} stripSecret된 user
 * @throws {AuthError} INVALID_CREDENTIALS
 */
async function login(input, opts = {}) {
    if (typeof input.username !== 'string' || typeof input.password !== 'string') {
        throw new AuthError('INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    const user = userService.findByUsername(input.username, opts);
    if (!user) {
        // 같은 메시지로 응답 — username 존재 여부 누설 방지
        throw new AuthError('INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    const ok = await bcrypt.compare(input.password, user.password_hash);
    if (!ok) {
        throw new AuthError('INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    userService.updateLastLogin(user.id, opts);
    return userService.stripSecret(user);
}

// ─────── 비밀번호 변경 ───────
/**
 * @throws {AuthError} INVALID_CREDENTIALS (현재 비밀번호 틀림) | VALIDATION (새 비밀번호 정책)
 */
async function changePassword(userId, { currentPassword, newPassword }, opts = {}) {
    const user = userService.findById(userId, opts);
    if (!user) {
        throw new AuthError('INVALID_CREDENTIALS', '사용자를 찾을 수 없습니다.');
    }
    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        throw new AuthError('INVALID_CREDENTIALS', '현재 비밀번호가 일치하지 않습니다.');
    }
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
        throw new AuthError('INVALID_CREDENTIALS', '현재 비밀번호가 일치하지 않습니다.');
    }
    const policyMsg = validatePassword(newPassword);
    if (policyMsg) {
        throw new AuthError('VALIDATION', 'newPassword: ' + policyMsg);
    }
    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    userService.updatePasswordHash(userId, newHash, opts);
}

/**
 * 비밀번호 검증만. 계정 삭제 등 추가 행동 직전 확인용.
 */
async function verifyPassword(userId, password, opts = {}) {
    const user = userService.findById(userId, opts);
    if (!user) return false;
    if (typeof password !== 'string' || password.length === 0) return false;
    return bcrypt.compare(password, user.password_hash);
}

module.exports = {
    AuthError,
    // 검증
    validateUsername,
    validateEmail,
    validatePassword,
    validateBirthYear,
    validateDisplayName,
    assertValidSignup,
    // 액션
    signup,
    login,
    changePassword,
    verifyPassword,
    // 정책 상수 (테스트·UI에서 참조 가능)
    POLICY: {
        USERNAME_RE,
        PASSWORD_MIN,
        MIN_AGE,
        BCRYPT_COST,
    },
};
