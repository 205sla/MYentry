# CODE 205

블록 코딩 기반 알고리즘 문제 풀이 플랫폼입니다.
좌측 패널에서 문제 지문을 읽고, 우측 에디터로 블록을 조립하여 풀이합니다.
제출 시 브라우저에서 테스트 케이스를 자동 채점합니다.

🌐 **Live**: [https://code.205.kr](https://code.205.kr) (Beta)

> **상표**: "205"®는 대한민국 특허청에 출원된 등록 상표입니다 (출원번호 40-2023-0165693). 상표 및 3rd-party 라이선스 정보는 [NOTICE.md](NOTICE.md)를 참고하세요.
>
> **Attribution**: 이 프로젝트는 [entrylabs/entryjs](https://github.com/entrylabs/entryjs) (Apache License 2.0)를 런타임 엔진으로 사용합니다. Entry Labs의 공식 서비스가 아닙니다.

## 실행 방법

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속 (Windows는 `start.bat` 더블클릭).

> 반드시 HTTP 서버를 통해 접속해야 합니다. `index.html`을 직접 더블클릭하면 브라우저 보안 정책 때문에 동작하지 않습니다.

### 요구 사항
- Node.js ≥ 18

## 화면 구성

### 메인 화면
- 문제 목록을 카드로 표시, 난이도를 별(0~5)로 표시
- 해결한 문제는 초록 테두리 + "✓ 해결" 배지로 구분 (브라우저 `localStorage`에만 저장)
- "자유 모드로 시작" 버튼으로 문제 없이 에디터 열기 가능
- 상단에 베타 안내 배너

### 에디터 화면
- 좌측: 문제 설명 패널 (Markdown 렌더링, 드래그로 크기 조절)
- 우측: 엔트리 블록 코딩 워크스페이스 + 스테이지
- 상단 헤더: 블록/파이썬 모드 전환, 실행취소/다시실행, 초기화, 테스트/제출

## 주요 기능

### 채점 시스템
- **로컬 채점**: 모든 채점은 브라우저에서 실행 (서버 부하 없음)
- **테스트하기**: 공개 케이스로 풀이 검증 (케이스 이름, 실패 상세 공개)
- **제출하기**: 숨김 케이스로 최종 평가 (케이스 이름, 실패 상세 비공개)
- **화면 차단 모달**: 채점 중 전체 화면을 가리고 진행 현황만 표시
- **⏹ 채점 중단** 버튼으로 즉시 취소 가능
- **전체 통과 시**: 해당 문제 id를 `localStorage`에 기록 + "🏠 문제 선택으로" 버튼 노출
- **시간 초과 감지**: 무한 반복 등 타임아웃 시 오답 처리 (기본 5초, 케이스별 설정 가능)
- **오류 감지**: 실행 중 경고(빨간색 블록) 발생 시 오류 처리
- **채점 중 보호**: 키보드 입력 차단, 엔진 시작/정지 버튼 차단

### 입출력 지원
| 입력 방식 | 출력 방식 |
|----------|----------|
| 없음 (고정 출력) | 말하기 (`say`) |
| 변수 (`setup.variables`) | 변수 최종값 (`expected.variables`) |
| 리스트 (`setup.lists`) | 리스트 최종값 (`expected.lists`) |
| 묻고 기다리기 (`대답`) | 복합 (say + 변수 + 리스트) |

### 파이썬 모드 호환
- 블록/파이썬 양쪽 모드에서 동일하게 채점
- 파이썬 모드의 변수/리스트 하드코딩 문제를 자동 재적용으로 해결

### 묻고 기다리기 자동 응답
- `tests.json`에 `"대답": "값"` 설정 시 채점 중 자동 입력
- 캔버스 기반 입력 필드를 감지하여 `Entry.container.setInputValue()` 호출

### 해결 기록 (localStorage)
- 제출에서 전체 통과 시 문제 id가 `entry:solved` 키로 브라우저에 저장됨
- 서버 저장 없음, 계정 없음 — 개인 브라우저 안에만 존재
- 초기화: DevTools 콘솔에서 `localStorage.removeItem('entry:solved')`

### 에디터 기능
- **실행취소/다시실행**: 헤더 버튼 + Ctrl+Z / Ctrl+Shift+Z
- **초기화**: 프로젝트를 원래 상태로 복원 (확인 다이얼로그 포함)
- **블록/파이썬 모드 전환**: 헤더 버튼
- **스프라이트 카탈로그**: 로컬 번들 SVG/PNG 스프라이트, 문제별 필터링

### 비활성화된 기능
알고리즘 플랫폼에 불필요하거나 서버 의존적인 기능을 비활성화:
- 블록 카테고리: 데이터 분석, 인공지능, 확장, 하드웨어
- 나만의 보관함, 오브젝트 내보내기, 블록 이미지 저장
- 모양/소리 편집기 (목록은 유지)
- 팝업 파일 올리기/새로 그리기/글상자/검색

## 디렉터리 구조

```
MYentry/
├── server.js                 # Express 서버 (포트 3000, PORT 환경변수 지원)
├── package.json              # scripts: start / test
├── PROBLEM_GUIDE.md          # 문제 출제 가이드라인
├── .github/workflows/
│   └── deploy.yml            # CI: 테스트 통과 시 자동 배포
├── problems/                 # 문제 데이터 (NNN/ 3자리 0패딩)
│   └── NNN/
│       ├── meta.json         # 제목, 난이도, 스프라이트 설정
│       ├── description.md    # Markdown 문제 설명
│       ├── project.ent       # 기본 프로젝트 (선택)
│       └── tests.json        # 테스트/채점 케이스
├── public/
│   ├── index.html            # 메인 화면
│   ├── editor.html           # Entry 블록 코딩 에디터
│   ├── css/
│   │   ├── index.css
│   │   └── editor.css
│   ├── js/
│   │   ├── index.js          # 메인 화면 스크립트
│   │   ├── editor.js         # 에디터 통합 로직
│   │   └── editor-pure.js    # 순수 함수 (테스트 대상)
│   ├── sprites/              # 로컬 스프라이트 카탈로그
│   │   ├── *.svg / *.png
│   │   └── catalog.json
│   └── lib/                  # Entry 라이브러리 (로컬 번들, ~64MB)
│       ├── entry-js/         # 엔트리 코어 엔진
│       ├── entry-tool/       # 팝업 UI
│       ├── entry-paint/      # 그림 편집기
│       ├── entry-lms/        # 모달 시스템
│       ├── sound-editor/     # 소리 편집기
│       └── legacy-video/     # 비디오 모듈
└── tests/                    # node:test 단위 테스트 (57개)
    ├── format.test.js
    ├── lists.test.js
    ├── markdown.test.js
    └── evaluate.test.js
```

## 문제 추가

`PROBLEM_GUIDE.md`에 상세한 출제 가이드라인이 있습니다.

간단 요약:

1. `problems/NNN/` 디렉터리 생성 (3자리 0패딩)
2. `meta.json` 작성: `{ "title": "제목", "difficulty": 2 }`
3. `description.md` 작성: 문제 설명 / 입력 / 출력 / 예시 / 힌트
4. `tests.json` 작성: `test` (공개) + `submit` (숨김) 케이스
5. `project.ent` (선택): playentry.org에서 내보낸 기본 프로젝트

**서버 재시작 불필요** — 파일 추가/수정 후 브라우저 새로고침으로 즉시 반영.

## API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/problems` | 전체 문제 목록 `[{id, title, difficulty}]` |
| `GET /api/problems/:id/meta` | 문제 제목 + 설명 |
| `GET /api/problems/:id/tests?mode=test\|submit` | 테스트 케이스 |
| `GET /api/problems/:id/has-tests` | 테스트 존재 여부 |
| `GET /api/problems/:id` | 프로젝트 데이터 (`.ent`에서 추출) |
| `GET /api/sprites` | 전체 스프라이트 카탈로그 |
| `GET /api/sprites?problem=N` | 문제별 스프라이트 필터링 |

## 개발

### 테스트

순수 함수(`evaluateTest`, `listsEqual`, `normalizeValue`, `renderMarkdown`, `escapeHtml`, `formatTimeoutResult`, `formatWarningResult`)는 Node 내장 `node:test`로 단위 테스트 되어 있습니다.

```bash
npm test
```

채점 로직 / XSS 이스케이프 / 리스트 비교 엣지케이스를 포함한 **57개 테스트**가 80ms 내 통과.

### CI/CD 파이프라인

`main` 브랜치 push 또는 `workflow_dispatch` 수동 트리거 시 GitHub Actions 실행 (`.github/workflows/deploy.yml`):

```
push → [ test ] ──(needs: test)──▶ [ deploy ] ──▶ [ health check ] → live
       57 tests                     git pull                HTTP 200 확인
       ~10초                        npm install
                                    pm2 reload entry
                                    pm2 save
                                    ~10초
```

- **총 소요**: ~20초
- **동시 배포 방지**: `concurrency: deploy-production`
- **SSH 인증**: 전용 ed25519 배포 키 (GitHub Secrets `DEPLOY_KEY`)
- **롤백**: `git revert <commit> && git push` → 자동 재배포

### 운영 인프라

| 계층 | 구성 | 비고 |
|------|------|------|
| 컴퓨트 | Oracle Cloud ARM A1 Flex (2 OCPU / 12 GB) | Always Free |
| OS | Ubuntu 22.04 LTS | |
| 리버스 프록시 | Nginx 1.18 (gzip, rate limit) | TLS 종료 |
| SSL | Let's Encrypt + certbot | 60일 자동 갱신 |
| 프로세스 관리 | PM2 6 + systemd(`pm2-ubuntu.service`) | 재부팅 자동 시작 |
| 모니터링 | PM2 logs, Nginx access/error logs | — |
| 예산 | OCI Budget $1, alert at 1% | 1원 과금 즉시 이메일 |

## 보안

### 애플리케이션 레이어
- **XSS 방어**: 모든 문자열은 `escapeHtml`/`renderMarkdown`을 거쳐 렌더링. 사용자 입력, 문제 이름, 오류 메시지 포함
- **자동 XSS 회귀 테스트** 5종 (`npm test`)
  - HTML 태그 이스케이프 / 코드 블록 이스케이프 / 인라인 코드 이스케이프 / 헤딩 이스케이프 / 변수명 이스케이프
- **Path Traversal 차단**: `server.js`의 `isValidId` 정규식(`/^\d+$/`)으로 숫자 문제 id만 허용 → `../` 조작 불가
- **Read-only API**: GET 전용 엔드포인트만 존재 → CSRF 무관

### Nginx 서버 하드닝
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options:    nosniff
X-Frame-Options:           SAMEORIGIN
Referrer-Policy:           strict-origin-when-cross-origin
Server:                    nginx                       (버전 은닉)
```

- **Rate Limiting**
  - 일반: 30 req/s per IP, burst 100
  - API: 10 req/s per IP, burst 30
  - 초과 시 HTTP 429 Too Many Requests
  - DDoS / 크롤러로 인한 대역폭 고갈 방지

### 시스템 레이어
- **SSH 강화**
  - Password 인증 비활성화 (키 인증 전용)
  - `fail2ban` — 5회 실패 시 10분 자동 차단
  - 승인된 키 2개만 (개인 + GitHub Actions 배포 전용)
- **방화벽**
  - OCI Security List: 22/80/443만 공개
  - iptables: 동일 포트 외 전부 REJECT
- **TLS 1.2 / 1.3만 허용** (SSLv3, TLS 1.0/1.1 차단)
- **불필요 서비스 비활성화**: `rpcbind` (NFS 미사용, CVE-2017-8779 등 공격면 제거)
- **최소 권한 실행**: Node.js가 `root`가 아닌 `ubuntu` 유저로 동작

### 비밀 관리
- SSH 개인키, 배포 키: `.gitignore`로 커밋 차단 (`*.key`, `*.pem`, `deploy-key*`)
- GitHub Secrets로 CI 크레덴셜 주입 (`DEPLOY_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`)
- Actions 로그에는 `***`로 마스킹되어 출력

## 기술 스택

- **Frontend**: EntryJS v4.0.22 (엔트리 블록 코딩 엔진)
- **Backend**: Node.js ≥ 18 + Express
- **Entry 라이브러리**: entry-js, entry-tool, entry-paint, entry-lms, sound-editor, legacy-video
- **테스트**: `node:test` (내장) + TAP
- **CI/CD**: GitHub Actions → SSH deploy
- **오프라인 대응**: Entry 관련 라이브러리는 `public/lib/`에 로컬 번들링. jQuery, React 등 범용 라이브러리만 CDN 사용.
