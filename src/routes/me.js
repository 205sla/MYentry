// /api/me/* — 로그인한 사용자 본인의 데이터 라우트.
// (현재 사용자 정보 자체는 /api/auth/me에서 유지 — Phase 2 호환.)
//
// 모든 라우트가 requireAuth로 보호.

'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const problemService = require('../services/problemService');
const solutionService = require('../services/solutionService');

const router = express.Router();

// 모든 /api/me/* 는 인증 강제
router.use(requireAuth);

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
        return res.status(404).json({ error: 'NOT_FOUND', message: '존재하지 않는 문제입니다.' });
    }
    const created = solutionService.markSolved(req.user.id, id);
    res.status(created ? 201 : 200).json({ ok: true, created });
});

// ─────── DELETE /api/me/solved/:problemId ───────
// 멱등 — 없어도 200. 자동 sync 디버깅·향후 "기록 삭제" 기능용.
router.delete('/solved/:problemId', (req, res) => {
    const id = problemService.padId(req.params.problemId);
    const removed = solutionService.unmarkSolved(req.user.id, id);
    res.json({ ok: true, removed });
});

module.exports = router;
