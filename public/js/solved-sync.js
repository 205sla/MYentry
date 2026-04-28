// 클라이언트 ↔ 서버 solved 동기화.
// localStorage 'entry:solved'는 정수 배열(예: [1, 3, 17])로 유지(기존 호환),
// 서버 API는 문자열(예: "001", "017")로 통신 — 양쪽 변환은 이 모듈이 담당.
//
// 노출:
//   window.SolvedSync.padId(n)          — 정수 → 3자리 문자열
//   window.SolvedSync.loadLocal()       — localStorage 정수 배열 반환
//   window.SolvedSync.markLocal(idNum)  — localStorage에 단일 추가 (기존 markProblemSolved 대체 가능)
//   window.SolvedSync.markRemote(idNum) — 서버에 등록 (로그인 사용자만, fail은 무시)
//   window.SolvedSync.syncWithServer()  — 양방향 병합. Promise<{added, uploaded, isLoggedIn}>
//
// 사용 패턴:
//   - index.html: 페이지 로드 시 syncWithServer() → 완료되면 grid 다시 렌더
//   - editor.js: 정답 통과 시 markLocal + markRemote (markRemote는 비로그인이면 no-op)

(function () {
    'use strict';

    var STORAGE_KEY = 'entry:solved';

    function padId(n) {
        return String(parseInt(n, 10)).padStart(3, '0');
    }

    function loadLocal() {
        try {
            var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            if (!Array.isArray(list)) return [];
            // 정수만 필터링·정규화
            var out = [];
            for (var i = 0; i < list.length; i++) {
                var n = parseInt(list[i], 10);
                if (n > 0 && out.indexOf(n) === -1) out.push(n);
            }
            return out;
        } catch (e) { return []; }
    }

    function saveLocal(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) { /* quota / privacy 모드 — 무시 */ }
    }

    function markLocal(idNum) {
        var n = parseInt(idNum, 10);
        if (!n) return;
        var list = loadLocal();
        if (list.indexOf(n) === -1) {
            list.push(n);
            saveLocal(list);
        }
    }

    // 단일 문제를 서버에 등록. 로그인 안 됐거나 네트워크 실패 시 그냥 종료(낙관적 UI).
    // 비-401 실패는 console.warn으로 노출 — silent skip이 디버깅을 가리지 않게.
    function markRemote(idNum) {
        var n = parseInt(idNum, 10);
        if (!n) return Promise.resolve(false);
        return window.Api.postJson(
            window.Api.URL.ME_SOLVED_ID(padId(n))
        ).then(function (r) {
            var ok = r.status === 200 || r.status === 201;
            if (!ok && r.status !== 401) {
                console.warn('[SolvedSync.markRemote]', n, 'HTTP', r.status);
            }
            return ok;
        }).catch(function (err) {
            console.warn('[SolvedSync.markRemote]', n, 'fetch failed', err);
            return false;
        });
    }

    // 페이지 로드 시 1회 호출. 비로그인이면 no-op.
    // 반환: { isLoggedIn, added, uploaded }
    //   added: 서버에서 받아 localStorage에 추가된 개수
    //   uploaded: localStorage에서 서버로 업로드한 개수
    function syncWithServer() {
        return window.Api.getJson(window.Api.URL.ME_SOLVED)
            .then(function (r) {
                if (r.status === 401) return { isLoggedIn: false };
                if (r.status !== 200) throw new Error('me/solved ' + r.status);
                return { isLoggedIn: true, server: (r.data && r.data.problems) || [] };
            })
            .then(function (state) {
                if (!state.isLoggedIn) {
                    return { isLoggedIn: false, added: 0, uploaded: 0 };
                }
                var local = loadLocal();
                var localPadded = local.map(padId);
                var serverSet = {};
                state.server.forEach(function (id) { serverSet[id] = true; });
                var localSet = {};
                localPadded.forEach(function (id) { localSet[id] = true; });

                // 1. 서버 → 로컬 (서버에만 있는 것)
                var newToLocal = state.server.filter(function (id) { return !localSet[id]; });
                if (newToLocal.length) {
                    var merged = local.slice();
                    newToLocal.forEach(function (id) {
                        var n = parseInt(id, 10);
                        if (n && merged.indexOf(n) === -1) merged.push(n);
                    });
                    saveLocal(merged);
                }

                // 2. 로컬 → 서버 (로컬에만 있는 것) — 비동기 fan-out
                var toUpload = localPadded.filter(function (id) { return !serverSet[id]; });
                var uploadPromises = toUpload.map(function (id) {
                    return window.Api.postJson(window.Api.URL.ME_SOLVED_ID(id))
                        .catch(function () { /* 일부 실패해도 나머지는 진행 */ });
                });

                return Promise.all(uploadPromises).then(function () {
                    return {
                        isLoggedIn: true,
                        added: newToLocal.length,
                        uploaded: toUpload.length,
                    };
                });
            })
            .catch(function (err) {
                // 네트워크 오류는 silent — localStorage만으로 정상 동작
                return { isLoggedIn: false, added: 0, uploaded: 0, error: String(err) };
            });
    }

    window.SolvedSync = {
        padId: padId,
        loadLocal: loadLocal,
        markLocal: markLocal,
        markRemote: markRemote,
        syncWithServer: syncWithServer,
    };
})();
