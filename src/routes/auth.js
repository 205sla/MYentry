// /api/auth/* 라우터.
// - POST signup/login/logout : 인증 액션
// - GET  me                  : 현재 세션 사용자 (없으면 null)
//
// AuthError 코드 → HTTP 상태 매핑:
//   VALIDATION         → 400
//   CONFLICT           → 409
//   INVALID_CREDENTIALS→ 401
//   AGE_RESTRICTED     → 400 (현재는 VALIDATION으로 흡수, 미래 분리 가능)

'use strict';

const express = require('express');
const auth = require('../services/authService');
const userService = require('../services/userService');
const { loginLimiter, signupLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const STATUS_BY_CODE = {
    VALIDATION: 400,
    CONFLICT: 409,
    INVALID_CREDENTIALS: 401,
    AGE_RESTRICTED: 400,
};

function sendAuthError(res, e) {
    const status = STATUS_BY_CODE[e.code] || 500;
    res.status(status).json({ error: e.code, message: e.message });
}

// ─────── 가입 ───────
router.post('/signup', signupLimiter, async (req, res) => {
    try {
        const user = await auth.signup({
            username: req.body?.username,
            email: req.body?.email,
            password: req.body?.password,
            birthYear: req.body?.birthYear,
            displayName: req.body?.displayName,
        });
        // 가입 직후 자동 로그인 (편의). 미래에 이메일 인증 도입 시 분리 고려.
        req.session.userId = user.id;
        res.status(201).json({ user });
    } catch (e) {
        if (e instanceof auth.AuthError) return sendAuthError(res, e);
        console.error('[POST /api/auth/signup]', e);
        res.status(500).json({ error: 'INTERNAL', message: '서버 오류' });
    }
});

// ─────── 로그인 ───────
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const user = await auth.login({
            username: req.body?.username,
            password: req.body?.password,
        });
        req.session.userId = user.id;
        res.json({ user });
    } catch (e) {
        if (e instanceof auth.AuthError) return sendAuthError(res, e);
        console.error('[POST /api/auth/login]', e);
        res.status(500).json({ error: 'INTERNAL', message: '서버 오류' });
    }
});

// ─────── 로그아웃 ───────
router.post('/logout', (req, res) => {
    if (!req.session) return res.json({ ok: true });
    req.session.destroy((err) => {
        if (err) {
            console.error('[POST /api/auth/logout]', err);
            return res.status(500).json({ error: 'INTERNAL', message: '로그아웃 실패' });
        }
        res.clearCookie('code205.sid');
        res.json({ ok: true });
    });
});

// ─────── 현재 사용자 ───────
router.get('/me', (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.json({ user: null });

    const raw = userService.findById(userId);
    if (!raw) {
        // DB에서 사용자가 사라졌는데 세션만 남은 비정상 상태 → 정리
        req.session.destroy(() => {});
        return res.json({ user: null });
    }
    res.json({ user: userService.stripSecret(raw) });
});

module.exports = router;
