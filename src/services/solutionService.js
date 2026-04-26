// 사용자의 해결 문제 기록 CRUD.
// problem_id는 padId된 문자열(예: "017"). 호출 측에서 padId 통과시킨 값만 넘겨야 함.
// 모든 함수 동기 (better-sqlite3).

'use strict';

const { getDb } = require('../db/init');

/**
 * 해결 기록 추가 (멱등). 이미 있으면 IGNORE.
 * @returns {boolean} 새로 추가됐으면 true, 이미 있었으면 false
 */
function markSolved(userId, problemId, opts = {}) {
    const db = opts.db || getDb();
    const now = Math.floor(Date.now() / 1000);
    const info = db.prepare(`
        INSERT OR IGNORE INTO solutions (user_id, problem_id, solved_at)
        VALUES (?, ?, ?)
    `).run(userId, problemId, now);
    return info.changes > 0;
}

/**
 * 해결 기록 제거 (자동 sync 디버그용. UI는 보통 제공 X).
 * @returns {boolean} 제거됐으면 true
 */
function unmarkSolved(userId, problemId, opts = {}) {
    const db = opts.db || getDb();
    const info = db.prepare(`
        DELETE FROM solutions WHERE user_id = ? AND problem_id = ?
    `).run(userId, problemId);
    return info.changes > 0;
}

/**
 * 사용자의 모든 해결 problem_id 배열 (solved_at 오름차순).
 */
function listProblemIds(userId, opts = {}) {
    const db = opts.db || getDb();
    // 같은 초에 추가된 항목들은 ROWID(INSERT 순서)로 후순위 정렬해 안정 보장.
    return db.prepare(`
        SELECT problem_id FROM solutions WHERE user_id = ?
        ORDER BY solved_at ASC, ROWID ASC
    `).all(userId).map((r) => r.problem_id);
}

/**
 * 상세 정보 포함 목록 (timestamp 함께). 프로필 페이지·통계용.
 */
function listSolutions(userId, opts = {}) {
    const db = opts.db || getDb();
    return db.prepare(`
        SELECT problem_id, solved_at FROM solutions WHERE user_id = ?
        ORDER BY solved_at ASC, ROWID ASC
    `).all(userId);
}

/**
 * 한 사용자의 해결 개수.
 */
function countByUser(userId, opts = {}) {
    const db = opts.db || getDb();
    return db.prepare(`SELECT COUNT(*) AS n FROM solutions WHERE user_id = ?`).get(userId).n;
}

/**
 * 특정 사용자의 특정 문제 해결 여부.
 */
function isSolved(userId, problemId, opts = {}) {
    const db = opts.db || getDb();
    const row = db.prepare(`
        SELECT 1 FROM solutions WHERE user_id = ? AND problem_id = ? LIMIT 1
    `).get(userId, problemId);
    return !!row;
}

module.exports = {
    markSolved,
    unmarkSolved,
    listProblemIds,
    listSolutions,
    countByUser,
    isSolved,
};
