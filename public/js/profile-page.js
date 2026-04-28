// 프로필 페이지 — 4개 폼 + 풀이 통계.
//   1. 정보 카드: PATCH /api/me  (이메일·표시이름)
//   2. 풀이 통계: GET /api/me/solved + GET /api/problems → 난이도별 집계
//   3. 비밀번호 변경: POST /api/me/password
//   4. 계정 삭제: DELETE /api/me  (확인 텍스트 + 비밀번호)
//
// 비로그인 진입 시 즉시 /login.html?next=/profile.html로 redirect.

(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function show(el, msg) {
        if (!el) return;
        el.textContent = msg;
        el.hidden = false;
    }
    function hide(el) {
        if (!el) return;
        el.hidden = true;
        el.textContent = '';
    }

    function clearMessages() {
        ['infoError', 'infoSuccess', 'pwError', 'pwSuccess', 'delError', 'resetError', 'resetSuccess'].forEach(function (id) {
            hide($(id));
        });
    }

    async function postJson(method, url, body) {
        var res = await fetch(url, {
            method: method,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        var data = {};
        try { data = await res.json(); } catch (_) { /* */ }
        return { status: res.status, data: data };
    }

    function setBusy(btn, busy, originalLabel) {
        if (!btn) return;
        btn.disabled = busy;
        btn.textContent = busy ? '처리 중…' : originalLabel;
    }

    // ─────── 사용자 정보 채우기 ───────
    function fillUserForm(user) {
        var f = $('infoForm');
        f.elements['username'].value = user.username || '';
        f.elements['birthYear'].value = user.birth_year || '';
        f.elements['displayName'].value = user.display_name || '';
        f.elements['email'].value = user.email || '';
    }

    // ─────── 풀이 통계 ───────
    function renderStats(problems, solvedIds) {
        var body = $('statsBody');
        var solvedSet = {};
        solvedIds.forEach(function (id) { solvedSet[id] = true; });

        // padId 정규화 (서버는 "001" 형식, 카탈로그는 정수일 수도)
        function pad(n) { return String(parseInt(n, 10)).padStart(3, '0'); }

        var byDiff = [0, 0, 0, 0, 0, 0]; // 0~5
        var solvedByDiff = [0, 0, 0, 0, 0, 0];
        var totalSolved = 0;

        problems.forEach(function (p) {
            var d = Math.max(0, Math.min(5, p.difficulty || 0));
            byDiff[d]++;
            var idStr = pad(p.id);
            if (solvedSet[idStr]) {
                solvedByDiff[d]++;
                totalSolved++;
            }
        });

        var totalProblems = problems.length;
        var pct = totalProblems > 0 ? Math.round((totalSolved / totalProblems) * 100) : 0;

        var diffItems = '';
        for (var d = 0; d <= 5; d++) {
            var stars = '';
            for (var i = 0; i < 5; i++) {
                stars += i < d
                    ? '<span>&#9733;</span>'
                    : '<span class="star-empty">&#9733;</span>';
            }
            if (d === 0) stars = '<span class="star-empty">&#9733;</span>';
            diffItems +=
                '<div class="stats-diff-item">' +
                    '<div class="stats-diff-stars">' + stars + '</div>' +
                    '<div class="stats-diff-count">' + solvedByDiff[d] + '</div>' +
                    '<div class="stats-diff-total">/ ' + byDiff[d] + '</div>' +
                '</div>';
        }

        body.innerHTML =
            '<div class="stats-summary">' +
                '<strong>' + totalSolved + '</strong> / ' + totalProblems + ' 문제 해결 (' + pct + '%)' +
            '</div>' +
            '<div class="stats-bar"><div class="stats-bar-fill"></div></div>' +
            '<div class="stats-difficulty">' + diffItems + '</div>';

        // CSP의 style-src 'self'가 inline style 속성을 차단하므로
        // DOM 생성 후 .style 프로퍼티로 설정 (CSSOM 조작은 CSP에 영향 X).
        var fill = body.querySelector('.stats-bar-fill');
        if (fill) fill.style.width = pct + '%';
    }

    // 통계 + 제출 목록을 독립적으로 호출 — 한쪽 fetch 실패해도 다른 쪽은 표시.
    // problems 카탈로그는 한 번만 받아 두 쪽이 공유.
    function loadStatsAndSubmissions() {
        var problemsPromise = fetch('/api/problems')
            .then(function (r) { return r.ok ? r.json() : []; })
            .catch(function (err) {
                console.warn('[profile] /api/problems failed', err);
                return [];
            });

        var solvedPromise = fetch('/api/me/solved', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : { problems: [] }; })
            .catch(function (err) {
                console.warn('[profile] /api/me/solved failed', err);
                return { problems: [] };
            });

        Promise.all([problemsPromise, solvedPromise]).then(function (results) {
            var problems = results[0] || [];
            var solved = (results[1] && results[1].problems) || [];
            try { renderStats(problems, solved); }
            catch (e) {
                console.warn('[profile] renderStats failed', e);
                $('statsBody').innerHTML = '<div class="stats-loading">통계를 불러올 수 없습니다.</div>';
            }
            // 제출 목록은 통계 결과와 무관하게 항상 시도
            loadSubmissions(problems);
        });
    }

    // ─────── 내가 푼 코드 목록 ───────
    // escapeHtml은 dom-escape.js가 window에 노출 — profile.html에서 먼저 로드.
    var escapeHtml = window.escapeHtml;

    function fmtDate(epochSec) {
        var d = new Date(epochSec * 1000);
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function fmtSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        return Math.round(bytes / 1024 * 10) / 10 + ' KB';
    }

    function loadSubmissions(problems) {
        // problems: 통계 단계에서 받은 [{id, title, difficulty, ...}, ...]
        var titleByPad = {};
        problems.forEach(function (p) {
            var pad = String(parseInt(p.id, 10)).padStart(3, '0');
            titleByPad[pad] = p.title || '';
        });

        fetch('/api/me/submissions', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : { submissions: [] }; })
            .then(function (data) {
                renderSubmissions(data.submissions || [], titleByPad);
            })
            .catch(function () {
                $('submissionsBody').innerHTML = '<div class="submissions-empty">목록을 불러올 수 없습니다.</div>';
            });
    }

    function renderSubmissions(list, titleByPad) {
        var box = $('submissionsBody');
        if (!list.length) {
            box.innerHTML = '<div class="submissions-empty">아직 저장된 코드가 없습니다. 정답을 통과하면 자동 저장돼요.</div>';
            return;
        }
        // 행을 <a>로 만들어 Ctrl/가운데 클릭 새 탭, Tab/Enter 표준 동작 지원.
        // editor 진입 후 자동으로 복원 모달이 떠서 코드를 불러올지 묻는다.
        var html = '';
        list.forEach(function (s) {
            var title = titleByPad[s.problem_id] || '(삭제된 문제)';
            var href = '/editor.html?problem=' + encodeURIComponent(s.problem_id);
            html +=
                '<a class="submission-row" href="' + href + '">' +
                    '<span class="submission-pid">' + escapeHtml(s.problem_id) + '</span>' +
                    '<span class="submission-title">' + escapeHtml(title) + '</span>' +
                    '<span class="submission-meta">' + fmtDate(s.submitted_at) + ' · ' + fmtSize(s.code_size) + '</span>' +
                '</a>';
        });
        box.innerHTML = html;
    }

    // ─────── 부트 ───────
    document.addEventListener('DOMContentLoaded', function () {
        // me 호출 → 비로그인이면 redirect
        fetch('/api/me', { credentials: 'same-origin' })
            .then(function (r) {
                if (r.status === 401) {
                    location.href = '/login.html?next=' + encodeURIComponent('/profile.html');
                    return null;
                }
                if (!r.ok) throw new Error('me ' + r.status);
                return r.json();
            })
            .then(function (data) {
                if (!data) return;
                fillUserForm(data.user);
                loadStatsAndSubmissions();
            })
            .catch(function () {
                show($('infoError'), '프로필 정보를 불러올 수 없습니다.');
            });

        // ─── 정보 폼 ───
        $('infoForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            clearMessages();
            var f = e.target;
            var btn = $('infoSubmit');
            var payload = {
                email: f.elements['email'].value.trim(),
                displayName: f.elements['displayName'].value.trim(),
            };
            setBusy(btn, true, '정보 저장');
            try {
                var r = await postJson('PATCH', '/api/me', payload);
                if (r.status === 200) {
                    fillUserForm(r.data.user);
                    show($('infoSuccess'), '정보가 저장되었습니다.');
                } else {
                    show($('infoError'), r.data.message || '저장에 실패했습니다.');
                }
            } catch (_) {
                show($('infoError'), '네트워크 오류가 발생했습니다.');
            } finally {
                setBusy(btn, false, '정보 저장');
            }
        });

        // ─── 비밀번호 폼 ───
        $('pwForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            clearMessages();
            var f = e.target;
            var btn = $('pwSubmit');
            var current = f.elements['currentPassword'].value;
            var nw = f.elements['newPassword'].value;
            var confirm = f.elements['newPasswordConfirm'].value;
            if (nw !== confirm) {
                show($('pwError'), '새 비밀번호 확인이 일치하지 않습니다.');
                return;
            }
            setBusy(btn, true, '비밀번호 변경');
            try {
                var r = await postJson('POST', '/api/me/password', {
                    currentPassword: current,
                    newPassword: nw,
                });
                if (r.status === 200) {
                    f.reset();
                    show($('pwSuccess'), '비밀번호가 변경되었습니다.');
                } else {
                    show($('pwError'), r.data.message || '비밀번호 변경에 실패했습니다.');
                }
            } catch (_) {
                show($('pwError'), '네트워크 오류가 발생했습니다.');
            } finally {
                setBusy(btn, false, '비밀번호 변경');
            }
        });

        // ─── 풀이 데이터 초기화 ───
        $('resetBtn').addEventListener('click', async function () {
            clearMessages();
            if (!window.confirm('정말 모든 풀이 기록과 저장된 코드를 삭제하시겠어요?\n계정과 프로필 정보는 유지됩니다.')) {
                return;
            }
            var btn = $('resetBtn');
            setBusy(btn, true, '모든 풀이 데이터 삭제');
            try {
                var solvedRes = await postJson('DELETE', '/api/me/solved');
                var subsRes = await postJson('DELETE', '/api/me/submissions');
                if (solvedRes.status === 200 && subsRes.status === 200) {
                    // localStorage entry:solved도 같이 정리 — 안 그러면 다음 로드 시
                    // syncWithServer가 다시 서버로 업로드.
                    try { localStorage.removeItem('entry:solved'); } catch (_) {}
                    var removedTotal = (solvedRes.data.removed || 0) + (subsRes.data.removed || 0);
                    show($('resetSuccess'), '풀이 데이터를 모두 삭제했습니다 (총 ' + removedTotal + '건). 잠시 후 새로고침합니다.');
                    setTimeout(function () { location.reload(); }, 1200);
                } else {
                    show($('resetError'), '삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
                }
            } catch (_) {
                show($('resetError'), '네트워크 오류가 발생했습니다.');
            } finally {
                setBusy(btn, false, '모든 풀이 데이터 삭제');
            }
        });

        // ─── 계정 삭제 폼 ───
        $('delForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            clearMessages();
            var f = e.target;
            var btn = $('delSubmit');
            var pw = f.elements['password'].value;
            var confirm = f.elements['confirm'].value.trim();
            if (confirm !== 'DELETE') {
                show($('delError'), '확인 문구로 정확히 "DELETE"를 입력해주세요.');
                return;
            }
            if (!window.confirm('정말 계정을 삭제하시겠습니까? 모든 풀이 기록이 사라집니다.')) {
                return;
            }
            setBusy(btn, true, '계정 영구 삭제');
            try {
                var r = await postJson('DELETE', '/api/me', { password: pw });
                if (r.status === 200) {
                    // 로컬 entry:solved도 정리 (다른 사용자 데이터 누설 방지)
                    try { localStorage.removeItem('entry:solved'); } catch (_) {}
                    location.href = '/';
                } else {
                    show($('delError'), r.data.message || '삭제에 실패했습니다.');
                }
            } catch (_) {
                show($('delError'), '네트워크 오류가 발생했습니다.');
            } finally {
                setBusy(btn, false, '계정 영구 삭제');
            }
        });
    });
})();
