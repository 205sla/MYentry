// Express 앱 팩토리.
// - server.js는 createApp() + listen만 담당.
// - 테스트는 createApp({ sessionStore: new MemoryStore(), disableRateLimit: true })로 격리.
//
// 기본 동작은 production과 동일 (SQLite 세션 store, rate-limit 활성).

'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const {
    PUBLIC_DIR,
    DB_PATH, SESSION_SECRET, SESSION_COOKIE_SECURE,
} = require('./config');

const seoRouter = require('./routes/seo');
const problemsRouter = require('./routes/problems');
const spritesRouter = require('./routes/sprites');
const exportRouter = require('./routes/export');
const authRouter = require('./routes/auth');
const meRouter = require('./routes/me');
const { errorHandler } = require('./routes/_respond');

function defaultSessionStore() {
    return new SQLiteStore({
        db: path.basename(DB_PATH),
        dir: path.dirname(DB_PATH),
        table: 'sessions',
    });
}

/**
 * @param {object} [opts]
 * @param {object} [opts.sessionStore]    express-session store (테스트는 MemoryStore 권장)
 * @param {boolean} [opts.disableRateLimit] 테스트에서 rate-limit 우회 (rateLimit.skip이 검사)
 * @returns {express.Express}
 */
function createApp(opts = {}) {
    // DB 부트스트랩 — 스키마 멱등 적용. SQLiteStore가 같은 파일을 잡기 전에 호출.
    require('./db/init').getDb();

    const app = express();
    app.set('trust proxy', 1);

    if (opts.disableRateLimit) {
        app.set('disableRateLimit', true);
    }

    // ─────── 보안 미들웨어 (CSP path 분기) ───────
    // - editor.html과 그 자원(/lib/*)은 CSP 비활성: Entry 런타임이 inline script/style·eval 사용
    // - 나머지 페이지·API는 strict CSP: 외부 도메인 일절 미허용 (XSS 방어)
    // - COEP는 Entry 임베드 자원 호환을 위해 전역 비활성 유지
    const STRICT_CSP_DIRECTIVES = {
        'default-src': ["'self'"],
        'script-src':  ["'self'"],
        'style-src':   ["'self'"],
        'img-src':     ["'self'", 'data:'],
        'font-src':    ["'self'"],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri':    ["'self'"],
        'form-action': ["'self'"],
        'object-src':  ["'none'"],
    };

    const helmetStrict = helmet({
        contentSecurityPolicy: { directives: STRICT_CSP_DIRECTIVES },
        crossOriginEmbedderPolicy: false,
    });
    const helmetEditor = helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    });

    function isEditorScope(reqPath) {
        return reqPath === '/editor.html' || reqPath.startsWith('/lib/');
    }

    app.use((req, res, next) => {
        if (isEditorScope(req.path)) return helmetEditor(req, res, next);
        helmetStrict(req, res, next);
    });

    // 바디 파서 분기:
    //   - /api/export        : 별도 (라우트가 자체 처리, 25MB)
    //   - /api/me/submissions: 100KB (Entry.exportProject JSON 수용)
    //   - 그 외              : 30KB (기본 안전선)
    app.use((req, res, next) => {
        if (req.path === '/api/export') return next();
        if (req.path.startsWith('/api/me/submissions')) {
            return express.json({ limit: '100kb' })(req, res, next);
        }
        express.json({ limit: '30kb' })(req, res, next);
    });

    // 정적 파일
    app.use(express.static(PUBLIC_DIR));

    // 세션 (커스텀 store 주입 가능)
    app.use(session({
        store: opts.sessionStore || defaultSessionStore(),
        name: 'code205.sid',
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: SESSION_COOKIE_SECURE,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        },
    }));

    // 라우터
    app.use('/', seoRouter);
    app.use('/api/problems', problemsRouter);
    app.use('/api/sprites', spritesRouter);
    app.use('/api/export', exportRouter);
    app.use('/api/auth', authRouter);
    app.use('/api/me', meRouter);

    // 모든 라우터 뒤 — next(e) 또는 throw된 에러를 일괄 처리.
    // AuthError는 status 매핑, UNIQUE 제약은 409, 그 외는 500.
    app.use(errorHandler);

    return app;
}

module.exports = createApp;
