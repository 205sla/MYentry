// 인증 엔드포인트 rate-limit.
// - login: 15분 윈도우, 10회/IP, 성공 요청은 카운트 안 함 (오타 사용자 배려)
// - signup: 1시간 윈도우, 5회/IP (botnet 가입 방어)
//
// 테스트 격리: createApp({ disableRateLimit: true })로 noop 모드 활성 가능.
// (req.app.get('disableRateLimit')를 skip 함수에서 검사)

'use strict';

const rateLimit = require('express-rate-limit');

function shouldSkip(req) {
    return req.app.get('disableRateLimit') === true;
}

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: shouldSkip,
    handler: (req, res) => {
        res.status(429).json({
            error: 'TOO_MANY_REQUESTS',
            message: '잠시 후 다시 시도해주세요. (15분 내 로그인 시도 횟수 초과)',
        });
    },
});

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: shouldSkip,
    handler: (req, res) => {
        res.status(429).json({
            error: 'TOO_MANY_REQUESTS',
            message: '잠시 후 다시 시도해주세요. (1시간 내 가입 시도 횟수 초과)',
        });
    },
});

module.exports = { loginLimiter, signupLimiter };
