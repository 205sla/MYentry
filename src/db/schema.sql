-- CODE 205 SQLite 스키마 (v3)
-- src/db/init.js가 첫 부트 때 멱등 적용한다 (CREATE TABLE IF NOT EXISTS).
-- 컬럼 추가/제약 변경은 새 마이그레이션 단계로 분리 (단순 테이블 추가는 여기에).

-- ─────── users ───────
-- username: 로그인 ID (영숫자+_, 3-20자, 대소문자 구분 안 함은 service 레벨에서 lower-case 정규화)
-- email:    선택. NULL이면 비밀번호 분실 복구 불가 (학교 발급 계정 등 이메일 없는 학생 배려).
--           SQLite는 UNIQUE 컬럼에서 NULL 다중 허용 → 이메일 미입력 사용자 여러 명 OK.
-- birth_year: 14세 이상 가입 정책 검증용. 가입 시점에만 검증, DB는 단순 저장.
-- display_name: 화면 표시용 별칭. NULL이면 username을 표시.
-- created_at / last_login_at: Unix epoch (sec).
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    email         TEXT    UNIQUE,
    password_hash TEXT    NOT NULL,
    birth_year    INTEGER NOT NULL,
    display_name  TEXT,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
);

-- email은 UNIQUE 제약으로 자동 인덱스가 생기지만, 명시적으로 한 번 더 두진 않는다.
-- username도 UNIQUE라서 인덱스 자동.

-- ─────── solutions (v2) ───────
-- 사용자가 해결한 문제 기록. 클라이언트 localStorage(`entry:solved`)와 양방향 병합.
-- problem_id는 폴더명(3자리 문자열, 예: "017"). 외래키 X — 문제가 삭제되거나 번호가 바뀌어도
-- 기록은 유지(잘못된 데이터로 보일 뿐 NOT NULL/CASCADE 영향 없음).
-- (user_id, problem_id) PRIMARY KEY로 같은 사용자의 같은 문제는 1행만.
CREATE TABLE IF NOT EXISTS solutions (
    user_id    INTEGER NOT NULL,
    problem_id TEXT    NOT NULL,
    solved_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, problem_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────── submissions (v3) ───────
-- 정답 통과 시 자동 저장된 코드 (Entry.exportProject 결과를 JSON.stringify).
-- 문제당 1행만 (PRIMARY KEY로 자동 덮어쓰기 — INSERT OR REPLACE 사용).
-- 코드 한도는 라우트 레벨에서 100KB로 강제. ON DELETE CASCADE로 사용자 삭제 시 자동 정리.
CREATE TABLE IF NOT EXISTS submissions (
    user_id      INTEGER NOT NULL,
    problem_id   TEXT    NOT NULL,
    code         TEXT    NOT NULL,
    submitted_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, problem_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────── schema_version ───────
-- 마이그레이션 추적용. 스키마 변경 시 새 버전을 INSERT하고 애플리케이션이 대응.
CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_version (version, applied_at)
VALUES (1, strftime('%s', 'now'));
INSERT OR IGNORE INTO schema_version (version, applied_at)
VALUES (2, strftime('%s', 'now'));
INSERT OR IGNORE INTO schema_version (version, applied_at)
VALUES (3, strftime('%s', 'now'));
