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
        ['infoError', 'infoSuccess', 'pwError', 'pwSuccess', 'delError'].forEach(function (id) {
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
            '<div class="stats-bar"><div class="stats-bar-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="stats-difficulty">' + diffItems + '</div>';
    }

    function loadStats() {
        Promise.all([
            fetch('/api/me/solved', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : { problems: [] }; }),
            fetch('/api/problems').then(function (r) { return r.ok ? r.json() : []; }),
        ]).then(function (results) {
            renderStats(results[1] || [], (results[0] && results[0].problems) || []);
        }).catch(function () {
            $('statsBody').innerHTML = '<div class="stats-loading">통계를 불러올 수 없습니다.</div>';
        });
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
                loadStats();
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
