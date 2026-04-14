# Entry Algorithm Platform

Entry(엔트리) 블록 코딩 기반 알고리즘 문제 풀이 플랫폼

## 실행 방법

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속 (또는 `start.bat` 더블클릭)

## 구조

```
MYentry/
├── server.js          # Express 서버 (포트 3000)
├── ENT/               # 문제별 .ent 파일
│   ├── 1.ent
│   ├── 2.ent
│   └── ...
└── public/
    ├── index.html     # 메인 화면 (문제 선택)
    ├── editor.html    # Entry 블록 코딩 에디터
    └── lib/           # Entry 전용 라이브러리
```

## 기능

- **문제 선택**: 메인 화면에서 문제를 선택하면 해당 .ent 프로젝트가 에디터에 로드
- **블록 코딩**: 엔트리 블록을 드래그 앤 드롭으로 조립
- **코드 실행**: 시작하기 버튼으로 조립한 블록 로직 실행
- **자유 모드**: 문제 없이 빈 프로젝트에서 자유롭게 코딩
- **블록/파이썬 전환**: 블록 모드와 파이썬 텍스트 코딩 모드 전환

## 문제 추가 방법

`ENT/` 폴더에 `{번호}.ent` 파일을 추가하면 자동으로 문제 목록에 표시됩니다.

.ent 파일은 엔트리 공식 사이트(playentry.org)에서 '내 컴퓨터에 저장하기'로 내보낸 파일입니다.

## 기술 스택

- **Frontend**: EntryJS (엔트리 블록 코딩 엔진)
- **Backend**: Node.js + Express
- **Entry 라이브러리**: entry-js, entry-tool, entry-paint, entry-lms, sound-editor
