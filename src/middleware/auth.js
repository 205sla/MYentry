// 인증 미들웨어.
// - requireAuth : 비로그인 시 401 JSON. 보호된 API 라우트에 사용.
// - optionalAuth: 로그인 여부와 무관하게 통과. req.user를 채워줌.
//
// 두 미들웨어 모두 req.user를 세팅한다 (req.session.userId가 있으면 stripSecret된 user, 없으면 null).
// 응답 형식 정책: API는 401 JSON 고정. HTML 페이지의 리다이렉트는 클라이언트 측에서 처리.

'use strict';

const userService = require('../services/userService');

function attachUser(req) {
    const id = req.session?.userId;
    if (!id) {
        req.user = null;
        return;
    }
    const raw = userService.findById(id);
    req.user = raw ? userService.stripSecret(raw) : null;
    // 세션은 살았지만 DB에서 사용자가 사라진 경우 (계정 삭제 등)는 req.user=null로 처리.
    // 세션 정리는 호출 측에서 결정 (요청 분류에 따라 다름).
}

function requireAuth(req, res, next) {
    attachUser(req);
    if (!req.user) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
    }
    next();
}

function optionalAuth(req, res, next) {
    attachUser(req);
    next();
}

module.exports = { requireAuth, optionalAuth, attachUser };
