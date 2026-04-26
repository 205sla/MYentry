// 공용 설정·상수. server.js·라우터·서비스가 require.
// 파일이 src/ 내부에 있으므로 __dirname은 src/ — 저장소 루트는 한 단계 위.

const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PROBLEMS_DIR = path.join(ROOT_DIR, 'problems');
const SPRITES_CATALOG = path.join(PUBLIC_DIR, 'sprites', 'catalog.json');

const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || 'https://code.205.kr';

// .ent 내보내기 시 썸네일 긴 변 최대 픽셀 (Entry 기본 export와 동일 스케일).
const THUMB_MAX_PX = 96;

// ─────── DB / Session (Phase 2) ───────
// DB_PATH는 src/db/init.js가 사용. 상대 경로면 ROOT_DIR 기준으로 풀어준다.
const DB_PATH_RAW = process.env.DB_PATH || './db/data.db';
const DB_PATH = path.isAbsolute(DB_PATH_RAW)
    ? DB_PATH_RAW
    : path.join(ROOT_DIR, DB_PATH_RAW);

// SESSION_SECRET은 Phase 2-2에서 express-session에 주입.
// 개발 편의를 위해 default를 두지만, production에서는 .env로 반드시 override.
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me';
const SESSION_COOKIE_SECURE = process.env.SESSION_COOKIE_SECURE === 'true';

module.exports = {
    ROOT_DIR,
    PUBLIC_DIR,
    PROBLEMS_DIR,
    SPRITES_CATALOG,
    PORT,
    SITE_URL,
    THUMB_MAX_PX,
    DB_PATH,
    SESSION_SECRET,
    SESSION_COOKIE_SECURE,
};
