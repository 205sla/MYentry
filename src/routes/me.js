// /api/me/* — 로그인한 사용자 본인의 데이터 라우트.
// (현재 사용자 정보 자체는 /api/auth/me에서 유지 — Phase 2 호환.)
//
// 모든 라우트가 requireAuth로 보호.
// 에러 처리는 _respond.js의 errorHandler가 일괄 — 라우트는 throw / next(e) 또는
// 명시적 fail() 호출만 사용.

'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { fail } = require('./_respond');
const problemService = require('../services/problemService');
const solutionService = require('../services/solutionService');
const userService = require('../services/userService');
const submissionService = require('../services/submissionService');
const auth = require('../services/authService');

const CODE_MAX_BYTES = 100 * 1024; // 100KB

// /submissions 코드 본문 파싱용 — Entry.exportProject JSON이 30KB를 쉽게 넘기 때문.
// 글로벌 30KB 안전선과 분리하기 위해 라우트 단위로 부착.
const submissionBodyParser = express.json({ limit: '100kb' });

const router = express.Router();

// 모든 /api/me/* 는 인증 강제
router.use(requireAuth);

// ─────── GET /api/me ───────
// /api/auth/me와 동일 응답 (점진적 마이그레이션 alias).
router.get('/', (req, res) => {
    res.json({ user: req.user });
});

// ─────── PATCH /api/me ───────
// body: { email?, displayName? } — 키가 있으면 갱신, 빈 문자열은 NULL.
// username·birth_year는 불변.
router.patch('/', (req, res, next) => {
    const patch = {};
    if ('email' in (req.body || {})) {
        const err = auth.validateEmail(req.body.email);
        if (err) return fail(res, 400, 'VALIDATION', 'email: ' + err);
        patch.email = req.body.email;
    }
    if ('displayName' in (req.body || {})) {
        const err = auth.validateDisplayName(req.body.displayName);
        if (err) return fail(res, 400, 'VALIDATION', 'displayName: ' + err);
        patch.displayName = req.body.displayName;
    }
    if (Object.keys(patch).length === 0) {
        return fail(res, 400, 'VALIDATION', '변경할 필드가 없습니다.');
    }
    try {
        const updated = userService.updateUser(req.user.id, patch);
        res.json({ user: userService.stripSecret(updated) });
    } catch (e) {
        // UNIQUE 제약 위반은 errorHandler가 자동 409 처리.
        next(e);
    }
});

// ─────── POST /api/me/password ───────
// body: { currentPassword, newPassword }
router.post('/password', async (req, res, next) => {
    try {
        await auth.changePassword(req.user.id, {
            currentPassword: req.body?.currentPassword,
            newPassword: req.body?.newPassword,
        });
        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});

// ─────── POST /api/me/submissions/:problemId ───────
// body: { code: string }, max 100KB (submissionBodyParser가 한도 강제)
// 응답: 새로 추가됐으면 201, 덮어쓰기였으면 200
router.post('/submissions/:problemId', submissionBodyParser, (req, res) => {
    const id = problemService.padId(req.params.problemId);
    if (!problemService.isValidId(req.params.problemId) || !problemService.exists(id)) {
        return fail(res, 404, 'NOT_FOUND', '존재하지 않는 문제입니다.');
    }
    const code = req.body?.code;
    if (typeof code !== 'string' || code.length === 0) {
        return fail(res, 400, 'VALIDATION', 'code: 비어있을 수 없습니다.');
    }
    if (Buffer.byteLength(code, 'utf8') > CODE_MAX_BYTES) {
        return fail(res, 413, 'PAYLOAD_TOO_LARGE', '코드가 100KB를 초과합니다.');
    }
    const created = submissionService.saveSubmission(req.user.id, id, code);
    res.status(created ? 201 : 200).json({ ok: true, created });
});

// ─────── GET /api/me/submissions ───────
// 응답: { submissions: [{ problem_id, submitted_at, code_size }, ...] } — 코드 본문 제외
router.get('/submissions', (req, res) => {
    const list = submissionService.listSubmissions(req.user.id);
    res.json({ submissions: list });
});

// ─────── GET /api/me/submissions/:problemId ───────
// 응답: { problem_id, code, submitted_at } 또는 404
router.get('/submissions/:problemId', (req, res) => {
    const id = problemService.padId(req.params.problemId);
    if (!problemService.isValidId(req.params.problemId)) {
        return fail(res, 404, 'NOT_FOUND', '잘못된 문제 번호입니다.');
    }
    const row = submissionService.getSubmission(req.user.id, id);
    if (!row) {
        return fail(res, 404, 'NOT_FOUND', '저장된 코드가 없습니다.');
    }
    res.json(row);
});

// ─────── DELETE /api/me/submissions ───────
// 본인의 모든 제출 코드 일괄 삭제 — "프로필 풀이 데이터 초기화" 액션.
router.delete('/submissions', (req, res) => {
    const removed = submissionService.deleteAllByUser(req.user.id);
    res.json({ ok: true, removed });
});

// ─────── DELETE /api/me/submissions/:problemId ───────
router.delete('/submissions/:problemId', (req, res) => {
    const id = problemService.padId(req.params.problemId);
    const removed = submissionService.deleteSubmission(req.user.id, id);
    res.json({ ok: true, removed });
});

// ─────── DELETE /api/me ───────
// body: { password } — 비밀번호 재확인 후 삭제.
// 성공 시 세션 destroy + 쿠키 정리.
router.delete('/', async (req, res, next) => {
    try {
        const ok = await auth.verifyPassword(req.user.id, req.body?.password || '');
        if (!ok) {
            return fail(res, 401, 'INVALID_CREDENTIALS', '비밀번호가 일치하지 않습니다.');
        }
        userService.deleteUser(req.user.id);
        req.session.destroy((err) => {
            if (err) {
                console.error('[DELETE /api/me] session destroy', err);
                // 세션 삭제 실패해도 사용자는 삭제됨 — 200으로 응답하되 로그 남김.
            }
            res.clearCookie('code205.sid');
            res.json({ ok: true });
        });
    } catch (e) {
        next(e);
    }
});

// ─────── GET /api/me/solved ───────
// 응답: { problems: ["001", "003", ...] } — solved_at ASC + ROWID ASC 순
router.get('/solved', (req, res) => {
    const ids = solutionService.listProblemIds(req.user.id);
    res.json({ problems: ids });
});

// ─────── POST /api/me/solved/:problemId ───────
// 응답: 새로 추가됐으면 201, 이미 있었으면 200 — 어느 쪽이든 { ok:true, created }
// problem_id는 problems/ 폴더에 실제 존재하는 것만 허용 (잘못된 데이터 차단).
router.post('/solved/:problemId', (req, res) => {
    const id = problemService.padId(req.params.problemId);
    if (!problemService.isValidId(req.params.problemId) || !problemService.exists(id)) {
        return fail(res, 404, 'NOT_FOUND', '존재하지 않는 문제입니다.');
    }
    const created = solutionService.markSolved(req.user.id, id);
    res.status(created ? 201 : 200).json({ ok: true, created });
});

// ─────── DELETE /api/me/solved ───────
// 본인의 모든 풀이 기록 일괄 삭제 — "프로필 풀이 데이터 초기화" 액션.
router.delete('/solved', (req, res) => {
    const removed = solutionService.deleteAllByUser(req.user.id);
    res.json({ ok: true, removed });
});

// ─────── DELETE /api/me/solved/:problemId ───────
// 멱등 — 없어도 200. 자동 sync 디버깅·향후 "기록 삭제" 기능용.
router.delete('/solved/:problemId', (req, res) => {
    const id = problemService.padId(req.params.problemId);
    const removed = solutionService.unmarkSolved(req.user.id, id);
    res.json({ ok: true, removed });
});

module.exports = router;
