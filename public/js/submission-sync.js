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
        if (!n) {
            console.warn('[SubmissionSync.saveSubmission] invalid idNum', idNum);
            return Promise.resolve(false);
        }
        if (typeof Entry === 'undefined' || typeof Entry.exportProject !== 'function') {
            console.warn('[SubmissionSync.saveSubmission] Entry runtime not available');
            return Promise.resolve(false);
        }

        var project;
        try {
            project = Entry.exportProject({});
        } catch (e) {
            console.warn('[SubmissionSync.saveSubmission] Entry.exportProject threw', e);
            return Promise.resolve(false);
        }
        if (!project) {
            console.warn('[SubmissionSync.saveSubmission] Entry.exportProject returned falsy');
            return Promise.resolve(false);
        }

        var code;
        try {
            code = JSON.stringify(project);
        } catch (e) {
            console.warn('[SubmissionSync.saveSubmission] JSON.stringify threw', e);
            return Promise.resolve(false);
        }
        if (!code || code.length === 0) {
            console.warn('[SubmissionSync.saveSubmission] empty code after stringify');
            return Promise.resolve(false);
        }

        // UTF-8 byte 기준 — 라우트가 같은 검사를 하므로 미리 차단.
        var byteLen = code.length; // fallback
        if (typeof Blob !== 'undefined') {
            try { byteLen = new Blob([code]).size; } catch (_) { /* polyfill 없을 때 length */ }
        }
        if (byteLen > MAX_BYTES) {
            console.warn('[SubmissionSync.saveSubmission] code too large:', byteLen, 'bytes (max', MAX_BYTES + ')');
            return Promise.resolve(false);
        }

        return window.Api.postJson(
            window.Api.URL.ME_SUBMISSIONS_ID(padId(n)),
            { code: code }
        ).then(function (r) {
            var ok = r.status === 200 || r.status === 201;
            if (!ok && r.status !== 401) {
                console.warn('[SubmissionSync.saveSubmission]', n, 'HTTP', r.status);
            }
            return ok; // 401(비로그인), 413(초과), 404(없는 문제) 모두 false
        }).catch(function (err) {
            console.warn('[SubmissionSync.saveSubmission]', n, 'fetch failed', err);
            return false;
        });
    }

    // ─────── 로드 (이전 정답 코드 복원용) ───────
    // GET /api/me/submissions/{padId(idNum)} → project 객체(JSON.parse) 또는 null.
    //   401 (비로그인) / 404 (없음) → null  (정상 흐름, silent)
    //   5xx / network / parse 실패  → null + console.warn  (사용자에겐 silent)
    function loadMySubmission(idNum) {
        var n = parseInt(idNum, 10);
        if (!n) return Promise.resolve(null);

        return window.Api.getJson(
            window.Api.URL.ME_SUBMISSIONS_ID(padId(n))
        ).then(function (r) {
            if (r.status === 401 || r.status === 404) return null;
            if (r.status !== 200) {
                console.warn('[SubmissionSync.loadMySubmission] HTTP', r.status);
                return null;
            }
            if (!r.data || typeof r.data.code !== 'string') return null;
            try {
                return JSON.parse(r.data.code);
            } catch (e) {
                console.warn('[SubmissionSync.loadMySubmission] JSON parse failed', e);
                return null;
            }
        }).catch(function (err) {
            console.warn('[SubmissionSync.loadMySubmission] fetch failed', err);
            return null;
        });
    }

    window.SubmissionSync = {
        saveSubmission: saveSubmission,
        loadMySubmission: loadMySubmission,
    };
})();
