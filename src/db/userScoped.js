// 사용자(user_id) 외래키를 가진 테이블 공용 헬퍼.
// solutions·submissions·향후 bookmarks 등이 같은 패턴으로 자주 호출하는
// "내 행 개수"·"내 행 일괄 삭제"를 한 곳에 모아 중복을 제거.
//
// 테이블 이름은 호출 측에서 식별자 화이트리스트로만 넘기는 것을 전제 — 절대
// 외부 입력을 그대로 통과시키지 말 것 (better-sqlite3는 식별자 바인딩을 지원하지 않음).

'use strict';

const { getDb } = require('./init');

// 식별자 안전 검증 — [a-z_][a-z0-9_]* 만 허용.
// 실수로 외부 입력이 들어오는 회귀를 사전에 차단.
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
function assertIdent(table) {
    if (typeof table !== 'string' || !IDENT_RE.test(table)) {
        throw new Error('userScoped: invalid table identifier: ' + JSON.stringify(table));
    }
}

/**
 * 한 사용자가 가진 행 개수.
 * @param {string} table  화이트리스트된 테이블 이름 (예: 'solutions')
 * @param {number} userId
 * @param {{db?: import('better-sqlite3').Database}} [opts]
 * @returns {number}
 */
function countByUser(table, userId, opts = {}) {
    assertIdent(table);
    const db = opts.db || getDb();
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n;
}

/**
 * 한 사용자의 행을 일괄 삭제.
 * @param {string} table
 * @param {number} userId
 * @param {{db?: import('better-sqlite3').Database}} [opts]
 * @returns {number} 삭제된 행 수
 */
function deleteAllByUser(table, userId, opts = {}) {
    assertIdent(table);
    const db = opts.db || getDb();
    const info = db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    return info.changes;
}

module.exports = {
    countByUser,
    deleteAllByUser,
};
