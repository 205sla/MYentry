// 정답 통과 시 현재 프로젝트(Entry.exportProject)를 서버에 저장.
// editor.html 전용 — Entry 런타임이 로드된 환경에서만 의미.
// 비로그인이거나 네트워크 실패면 silent (낙관적 UI).
//
// 노출:
//   window.SubmissionSync.saveSubmission(idNum)

(function () {
    'use strict';

    var MAX_BYTES = 100 * 1024; // 서버 라우트 한도와 일치

    function padId(n) {
        return String(parseInt(n, 10)).padStart(3, '0');
    }

    function saveSubmission(idNum) {
        var n = parseInt(idNum, 10);
        if (!n) return Promise.resolve(false);
        if (typeof Entry === 'undefined' || typeof Entry.exportProject !== 'function') {
            return Promise.resolve(false);
        }

        var project;
        try {
            project = Entry.exportProject({});
        } catch (_) {
            return Promise.resolve(false);
        }
        if (!project) return Promise.resolve(false);

        var code;
        try {
            code = JSON.stringify(project);
        } catch (_) {
            return Promise.resolve(false);
        }
        if (!code || code.length === 0) return Promise.resolve(false);

        // UTF-8 byte 기준 — 라우트가 같은 검사를 하므로 미리 차단.
        if (typeof Blob !== 'undefined') {
            try {
                if (new Blob([code]).size > MAX_BYTES) return Promise.resolve(false);
            } catch (_) { /* polyfill 안 되면 length 폴백 */ }
        } else if (code.length > MAX_BYTES) {
            return Promise.resolve(false);
        }

        return fetch('/api/me/submissions/' + padId(n), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code }),
        }).then(function (r) {
            return r.ok; // 401(비로그인), 413(초과), 404(없는 문제) 모두 false
        }).catch(function () { return false; });
    }

    window.SubmissionSync = { saveSubmission: saveSubmission };
})();
