# 3rd-Party Notices

이 저장소는 오픈소스 라이브러리를 번들링하여 사용합니다. 각 구성 요소의 저작권과 라이선스를 아래에 명시합니다.

## EntryJS

- **저장소**: https://github.com/entrylabs/entryjs
- **저작권**: Copyright 2015 Entry Labs
- **라이선스**: Apache License 2.0
- **라이선스 전문**: [`public/lib/entry-js/LICENSE`](public/lib/entry-js/LICENSE)
- **NOTICE 원본**: [`public/lib/entry-js/NOTICE`](public/lib/entry-js/NOTICE)
- **사용 위치**: `public/lib/entry-js/` (컴파일된 번들 포함)
- **변경사항 요약**:
    - 원본 소스 미수정
    - 채점 로직은 별도 파일(`public/js/editor.js`, `public/js/editor-pure.js`)에서 Entry 런타임을 호출하는 방식으로 추가
    - 실행 시 `Entry.engine.toggleRun`/`toggleStop`을 래핑하여 사용자 인터랙션 가드 추가 (editor.js `installEngineGuard`)
    - 블록 카테고리 일부 비활성화 (`analysis`, `ai_utilize`, `expansion`, `arduino`) — Entry가 공식 제공하는 옵션을 통한 설정

## entry-tool, entry-paint, entry-lms, sound-editor, legacy-video

- **저작권**: Copyright Entry Labs
- **사용 위치**: `public/lib/` 내 각 서브디렉토리
- EntryJS와 동일 출처의 보조 라이브러리로 간주. 원본 라이선스는 각 라이브러리 배포판에 포함됨.

## 외부 CDN 의존성

런타임에 로드되는 범용 라이브러리(jQuery, lodash, React, CodeMirror 등)는 각자의 원본 배포판 라이선스를 따릅니다. `public/editor.html`의 `<script src="https://playentry.org/lib/...">` / `<script src="https://unpkg.com/...">` 경로 참조.

## 엔트리봇 및 관련 브랜드

"엔트리(Entry)"·"엔트리봇"·관련 캐릭터 이미지는 Entry Labs의 상표/저작물이며 본 프로젝트의 오픈소스 범위 밖입니다. 본 사이트는 Entry Labs의 공식 서비스가 아닙니다.

---

## 이 저장소(MYentry) 자체의 코드

상기 3rd-party 코드를 제외한 본 저장소 자체 저작물(server.js, public/js/\*, public/css/\*, public/contribute.html, public/index.html, problems/\* 등)은 별도 라이선스가 명시되지 않는 한 모든 권리가 저작자(205)에게 유보됩니다.
