// 사용자 CRUD. better-sqlite3는 동기 API라 모든 함수가 동기.
// 비밀번호 해싱은 authService에서 담당 — 여기는 password_hash 문자열을 그대로 받는다.
// 입력 검증(길이·정규식)도 authService 또는 라우트 레벨에서. 여기는 DB 레벨만.

'use strict';

const { getDb } = require('../db/init');

/**
 * 빈 문자열·undefined를 NULL로 정규화 (이메일·display_name처럼 옵셔널 컬럼용).
 */
function nullable(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    return v;
}

/**
 * 사용자 생성.
 * @param {object} input
 * @param {string} input.username        영숫자+_, 3-20자 (검증은 호출측 책임)
 * @param {string|null} [input.email]    선택. 빈 문자열도 NULL 처리.
 * @param {string} input.passwordHash    bcrypt 결과
 * @param {number} input.birthYear       4자리 연도
 * @param {string|null} [input.displayName]
 * @param {object} [opts] { db } 테스트 주입용
 * @returns {object} 생성된 사용자 (password_hash 제외)
 * @throws {Error} username/email 중복 시 SQLite UNIQUE 위반
 */
function createUser(input, opts = {}) {
    const db = opts.db || getDb();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
        INSERT INTO users (username, email, password_hash, birth_year, display_name, created_at)
        VALUES (@username, @email, @password_hash, @birth_year, @display_name, @created_at)
    `);

    const info = stmt.run({
        username: input.username,
        email: nullable(input.email),
        password_hash: input.passwordHash,
        birth_year: input.birthYear,
        display_name: nullable(input.displayName),
        created_at: now,
    });

    return findById(info.lastInsertRowid, opts);
}

/**
 * id로 조회. 존재하지 않으면 null.
 * 반환 객체에는 password_hash가 포함된다 (인증 검증 용도).
 * 외부 노출용은 stripSecret() 한 번 통과시킬 것.
 */
function findById(id, opts = {}) {
    const db = opts.db || getDb();
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

/**
 * username 단일 조회. case-sensitive (가입 시 lowercase 정규화 권장).
 */
function findByUsername(username, opts = {}) {
    const db = opts.db || getDb();
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
}

/**
 * email 단일 조회. NULL/빈 이메일은 항상 null 반환.
 */
function findByEmail(email, opts = {}) {
    const normalized = nullable(email);
    if (normalized === null) return null;
    const db = opts.db || getDb();
    return db.prepare('SELECT * FROM users WHERE email = ?').get(normalized) || null;
}

/**
 * 마지막 로그인 시각 갱신.
 */
function updateLastLogin(id, opts = {}) {
    const db = opts.db || getDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, id);
}

/**
 * 외부 응답에 보낼 때 비밀 필드 제거.
 */
function stripSecret(user) {
    if (!user) return null;
    const { password_hash, ...safe } = user;
    return safe;
}

module.exports = {
    createUser,
    findById,
    findByUsername,
    findByEmail,
    updateLastLogin,
    stripSecret,
};
