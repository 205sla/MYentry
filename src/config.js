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

module.exports = {
    ROOT_DIR,
    PUBLIC_DIR,
    PROBLEMS_DIR,
    SPRITES_CATALOG,
    PORT,
    SITE_URL,
    THUMB_MAX_PX,
};
