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

    // 보안 미들웨어 (CSP·COEP는 Entry 런타임 충돌 회피로 비활성)
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));

    // 바디 파서 (JSON 30KB 전역, /api/export만 별도)
    app.use((req, res, next) => {
        if (req.path === '/api/export') return next();
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

    return app;
}

module.exports = createApp;
