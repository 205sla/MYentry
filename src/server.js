// CODE 205 서버 진입점.
// 책임: 보안 미들웨어 → 바디 파서 → 정적 파일 → 라우터 연결 → listen.
// 구체 로직은 src/routes/·src/services/로 위임한다.

const express = require('express');
const helmet = require('helmet');
const { PUBLIC_DIR, PORT } = require('./config');

const seoRouter = require('./routes/seo');
const problemsRouter = require('./routes/problems');
const spritesRouter = require('./routes/sprites');
const exportRouter = require('./routes/export');

const app = express();

// ─────── 보안 미들웨어 ───────
// CSP·COEP는 Entry 런타임(inline script·style)과 충돌하므로 비활성.
// 회원 기능이 안정된 후 점진적으로 복원 예정.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// ─────── 바디 파서 ───────
// 전역 JSON 30KB 제한. /api/export는 25MB 개별 설정이 필요하므로 경로 기반 분기.
app.use((req, res, next) => {
    if (req.path === '/api/export') return next();
    express.json({ limit: '30kb' })(req, res, next);
});

// ─────── 정적 파일 ───────
app.use(express.static(PUBLIC_DIR));

// ─────── 라우터 ───────
app.use('/', seoRouter);
app.use('/api/problems', problemsRouter);
app.use('/api/sprites', spritesRouter);
app.use('/api/export', exportRouter);

// ─────── 시작 ───────
app.listen(PORT, () => {
    console.log('Entry Editor running at http://localhost:' + PORT);
});
