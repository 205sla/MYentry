/* ============================================================
   index.js — 메인 문제 선택 화면
   /api/problems에서 문제 목록을 받아 카드로 렌더링.
   localStorage의 entry:solved를 읽어 해결 상태 표시.
   ============================================================ */

// Read locally-saved solved problem ids (set by editor after passing 제출)
function getSolvedSet() {
    try {
        var list = JSON.parse(localStorage.getItem('entry:solved') || '[]');
        if (!Array.isArray(list)) return {};
        var set = {};
        list.forEach(function (id) { set[parseInt(id, 10)] = true; });
        return set;
    } catch (e) { return {}; }
}

fetch('/api/problems')
    .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(function(problems) {
        var grid = document.getElementById('problem-list');
        if (!problems.length) {
            grid.innerHTML = '<div class="empty">등록된 문제가 없습니다.</div>';
            return;
        }
        var solved = getSolvedSet();
        problems.forEach(function(p) {
            var a = document.createElement('a');
            var isSolved = !!solved[p.id];
            a.className = 'card' + (isSolved ? ' solved' : '');
            a.href = '/editor.html?problem=' + p.id;
            var stars = '';
            var d = Math.max(0, Math.min(5, p.difficulty || 0));
            for (var i = 0; i < 5; i++) {
                stars += i < d
                    ? '<span class="star-filled">&#9733;</span>'
                    : '<span class="star-empty">&#9733;</span>';
            }
            var badge = isSolved ? '<span class="card-solved-badge">&#10004; 해결</span>' : '';
            a.innerHTML = badge
                + '<div class="card-number">' + p.id + '</div>'
                + '<div class="card-title">' + p.title + '</div>'
                + '<div class="card-difficulty">' + stars + '</div>';
            grid.appendChild(a);
        });
    })
    .catch(function(err) {
        console.error('[/api/problems]', err);
        document.getElementById('problem-list').innerHTML =
            '<div class="empty">문제 목록을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.</div>';
    });
