// 사용자가 제출한 정답 코드 저장·조회.
// problem_id는 padId된 문자열("001"). 호출 측에서 padId 통과시킨 값만 넘겨야 함.
// 코드 사이즈 검증은 라우트 레벨에서 (서비스는 raw 저장).

'use strict';

const { getDb } = require('../db/init');

/**
 * 제출 저장 (덮어쓰기). 같은 문제는 항상 최신 1개만 유지.
 * @returns {boolean} 새로 추가됐으면 true, 덮어쓰기였으면 false
 */
function saveSubmission(userId, problemId, code, opts = {}) {
    const db = opts.db || getDb();
    const now = Math.floor(Date.now() / 1000);
    const existed = isSaved(userId, problemId, opts);
    db.prepare(`
        INSERT OR REPLACE INTO submissions (user_id, problem_id, code, submitted_at)
        VALUES (?, ?, ?, ?)
    `).run(userId, problemId, code, now);
    return !existed;
}

/**
 * 단건 조회 (전체 코드 포함). 없으면 null.
 */
function getSubmission(userId, problemId, opts = {}) {
    const db = opts.db || getDb();
    return db.prepare(`
        SELECT problem_id, code, submitted_at
        FROM submissions
        WHERE user_id = ? AND problem_id = ?
    `).get(userId, problemId) || null;
}

/**
 * 한 사용자의 모든 제출 미리보기 목록.
 * 코드 본문은 제외 (각 단건은 GET으로 조회).
 * 응답: [{ problem_id, submitted_at, code_size }, ...]
 */
function listSubmissions(userId, opts = {}) {
    const db = opts.db || getDb();
    return db.prepare(`
        SELECT problem_id, submitted_at, length(code) AS code_size
        FROM submissions
        WHERE user_id = ?
        ORDER BY submitted_at DESC, ROWID DESC
    `).all(userId);
}

/**
 * 멱등 제거. 없어도 false.
 */
function deleteSubmission(userId, problemId, opts = {}) {
    const db = opts.db || getDb();
    const info = db.prepare(`
        DELETE FROM submissions WHERE user_id = ? AND problem_id = ?
    `).run(userId, problemId);
    return info.changes > 0;
}

/**
 * 저장 여부만 확인 (saveSubmission의 created 판단용 헬퍼).
 */
function isSaved(userId, problemId, opts = {}) {
    const db = opts.db || getDb();
    const row = db.prepare(`
        SELECT 1 FROM submissions WHERE user_id = ? AND problem_id = ? LIMIT 1
    `).get(userId, problemId);
    return !!row;
}

/**
 * 한 사용자의 제출 개수.
 */
function countByUser(userId, opts = {}) {
    const db = opts.db || getDb();
    return db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE user_id = ?`).get(userId).n;
}

/**
 * 한 사용자의 모든 제출 코드 일괄 삭제. 반환: 삭제된 행 수.
 */
function deleteAllByUser(userId, opts = {}) {
    const db = opts.db || getDb();
    const info = db.prepare('DELETE FROM submissions WHERE user_id = ?').run(userId);
    return info.changes;
}

module.exports = {
    saveSubmission,
    getSubmission,
    listSubmissions,
    deleteSubmission,
    isSaved,
    countByUser,
    deleteAllByUser,
};
