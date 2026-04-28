// 헤더 우측에 사용자 메뉴를 동적으로 주입.
//   - 비로그인: "로그인" + "가입" 링크 (?next=현재 경로 자동)
//   - 로그인:  "닉네임 ▾" 버튼 + 드롭다운 (현재: 로그아웃)
// 4개 정적 페이지(index·contribute·privacy·terms)에서 로드.
// editor.html은 자체 헤더를 쓰므로 여기서 처리하지 않음.

(function () {
    'use strict';

    // escapeHtml은 dom-escape.js가 window에 노출 — HTML에서 이 파일보다 먼저 로드.
    var escapeHtml = window.escapeHtml;

    // ?next=PATH 안전 인코딩 — path-only로만 보장 (location.pathname은 항상 path).
    function nextQuery(currentPath) {
        if (!currentPath || currentPath === '/' ) return '';
        // 자기 자신을 가리키면 next 의미 없음
        if (currentPath === '/login.html' || currentPath === '/signup.html') return '';
        return '?next=' + encodeURIComponent(currentPath);
    }

    function renderLoggedOut(menu, currentPath) {
        var q = nextQuery(currentPath);
        menu.innerHTML =
            '<a class="auth-link" href="/login.html' + q + '">로그인</a>' +
            '<a class="auth-link primary" href="/signup.html' + q + '">가입</a>';
    }

    function renderLoggedIn(menu, user) {
        var name = user.display_name || user.username;
        menu.innerHTML =
            '<button class="username-button" type="button" aria-haspopup="menu" aria-expanded="false">' +
                '<span>' + escapeHtml(name) + '</span>' +
                '<span class="caret">▾</span>' +
            '</button>' +
            '<div class="user-dropdown" role="menu" hidden>' +
                '<a href="/profile.html" role="menuitem">프로필</a>' +
                '<button type="button" data-action="logout" role="menuitem">로그아웃</button>' +
            '</div>';

        var btn = menu.querySelector('.username-button');
        var dropdown = menu.querySelector('.user-dropdown');
        var logoutBtn = menu.querySelector('[data-action="logout"]');

        function close() {
            dropdown.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        }
        function toggle() {
            var willOpen = dropdown.hidden;
            dropdown.hidden = !willOpen;
            btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggle();
        });
        // 바깥 클릭으로 닫기
        document.addEventListener('click', function (e) {
            if (!menu.contains(e.target)) close();
        });
        // ESC로 닫기
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
        });

        logoutBtn.addEventListener('click', async function () {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                });
            } catch (_) { /* 네트워크 오류는 무시 — 페이지 reload만 진행 */ }
            location.reload();
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        // 정적 페이지: <header>, editor.html: <div id="header">. 둘 다 지원.
        var header = document.querySelector('header, #header');
        if (!header) return;

        var path = location.pathname;
        // 로그인/가입 페이지에서는 메뉴 자체를 안 그림 (자기 자신 링크 무의미)
        if (path === '/login.html' || path === '/signup.html') return;

        // editor의 #header는 h1에 flex:1이 이미 있어 자체 spacer 역할.
        // 일반 <header>는 별도 spacer 추가.
        if (header.tagName === 'HEADER') {
            var spacer = document.createElement('span');
            spacer.className = 'header-spacer';
            header.appendChild(spacer);
        }

        var menu = document.createElement('div');
        menu.className = 'user-menu';
        menu.id = 'userMenu';
        header.appendChild(menu);

        // 비로그인 placeholder를 먼저 그려 깜빡임 최소화 (로그인 사용자가 소수일 때 유효)
        renderLoggedOut(menu, path);

        // 실제 로그인 상태 조회
        fetch('/api/auth/me', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : { user: null }; })
            .then(function (data) {
                if (data && data.user) {
                    renderLoggedIn(menu, data.user);
                }
                // user가 null이면 placeholder 그대로
            })
            .catch(function () { /* 네트워크 오류 시 placeholder 유지 */ });
    });
})();
