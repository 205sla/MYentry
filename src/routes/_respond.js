// 라우트 응답 보일러플레이트.
// fail()       — 에러 응답 1줄 헬퍼 (status + error code + message).
// errorHandler — try/catch 보일러를 줄이는 Express 4 에러 미들웨어.
//                라우트가 next(e) 또는 throw하면 여기서 status/메시지로 변환.
//                AuthError 인스턴스나 .status 속성을 가진 에러를 인식.
//
// 사용 예:
//   router.get('/x', (req, res, next) => {
//       if (badInput) return fail(res, 400, 'VALIDATION', '잘못된 값');
//       try { ... } catch (e) { next(e); }   // 또는 async 라우트는 그대로 throw
//   });
//
// app.js 끝에 router 등록 후:
//   app.use(errorHandler);

'use strict';

const auth = require('../services/authService');

/**
 * 표준 에러 응답.
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code     — 'VALIDATION' / 'NOT_FOUND' / 'CONFLICT' 등
 * @param {string} message  — 사용자 표시용 한국어 메시지
 */
function fail(res, status, code, message) {
    return res.status(status).json({ error: code, message });
}

// AuthError code → HTTP status 매핑. routes/auth.js와 me.js 양쪽에서 같은 표 사용.
const AUTH_STATUS = {
    VALIDATION: 400,
    CONFLICT: 409,
    INVALID_CREDENTIALS: 401,
    AGE_RESTRICTED: 400,
};

/**
 * Express 4 error-handling middleware (4-인자 시그니처 필수).
 * 인식 규칙 (우선순위 순):
 *   1. AuthError              → AUTH_STATUS 매핑
 *   2. err.status가 숫자       → 그 status 사용
 *   3. SQLite UNIQUE 제약 위반 → 409 CONFLICT
 *   4. 그 외                  → 500 INTERNAL + console.error로 로그
 */
function errorHandler(err, req, res, _next) {
    if (err instanceof auth.AuthError) {
        const status = AUTH_STATUS[err.code] || 500;
        return res.status(status).json({ error: err.code, message: err.message });
    }
    if (typeof err.status === 'number') {
        return res.status(err.status).json({
            error: err.code || 'ERROR',
            message: err.message || '요청 처리 실패',
        });
    }
    if (err && /UNIQUE constraint failed/.test(err.message || '')) {
        return res.status(409).json({ error: 'CONFLICT', message: '이미 사용 중입니다.' });
    }
    console.error('[errorHandler]', req.method, req.originalUrl, err);
    return res.status(500).json({ error: 'INTERNAL', message: '서버 오류' });
}

module.exports = {
    fail,
    errorHandler,
    AUTH_STATUS,  // 테스트·디버그용 export
};
