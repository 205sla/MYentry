// 회원가입·로그인 페이지 공용 스크립트.
// signup.html / login.html 둘 다에서 로드되며, 폼 id로 분기.
//
// 책임:
//  - 폼 제출 → /api/auth/signup 또는 /login 호출
//  - 비밀번호 확인 일치 검증 (가입)
//  - 서버 에러 메시지 표시
//  - 성공 시 ?next=/path (path-only, 같은 origin) 또는 / 로 이동
//  - 진행 중에는 버튼 disable + 라벨 변경

(function () {
    'use strict';

    var signupForm = document.getElementById('signupForm');
    var loginForm = document.getElementById('loginForm');
    var errorBox = document.getElementById('formError');
    var submitBtn = document.getElementById('submitBtn');

    function showError(msg) {
        if (!errorBox) return;
        errorBox.textContent = msg;
        errorBox.hidden = false;
        // 화면 상단으로 스크롤 (모바일 대응)
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function clearError() {
        if (!errorBox) return;
        errorBox.hidden = true;
        errorBox.textContent = '';
    }

    // ?next= 쿼리 안전 파싱: 같은 origin path-only만 허용 (open-redirect 방어).
    function nextUrl() {
        var params = new URLSearchParams(location.search);
        var next = params.get('next');
        if (!next) return '/';
        // /로 시작하고 //로 시작하지 않는 path만 허용
        if (next.charAt(0) === '/' && next.charAt(1) !== '/') return next;
        return '/';
    }

    function setBusy(busy, originalLabel) {
        if (!submitBtn) return;
        submitBtn.disabled = busy;
        submitBtn.textContent = busy ? '처리 중…' : originalLabel;
    }

    // postJson은 api.js의 Api.postJson에 위임 — 정책 일원화.
    var postJson = function (url, body) { return window.Api.postJson(url, body); };

    function val(form, name) {
        var v = form.elements[name];
        if (!v) return '';
        return (v.value || '').trim();
    }

    // ─────── 가입 폼 ───────
    if (signupForm) {
        // 출생연도 max를 현재 연도로 (서버와 같은 정책)
        var yearInput = signupForm.querySelector('input[name=birthYear]');
        if (yearInput) yearInput.max = String(new Date().getFullYear());

        signupForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            clearError();

            var password = signupForm.elements['password'].value;
            var passwordConfirm = signupForm.elements['passwordConfirm'].value;
            if (password !== passwordConfirm) {
                showError('비밀번호 확인이 일치하지 않습니다.');
                return;
            }

            var birthYearStr = val(signupForm, 'birthYear');
            var birthYear = parseInt(birthYearStr, 10);
            if (!Number.isInteger(birthYear)) {
                showError('출생연도는 4자리 숫자로 입력해주세요.');
                return;
            }

            var payload = {
                username: val(signupForm, 'username'),
                password: password,
                birthYear: birthYear,
                email: val(signupForm, 'email') || undefined,
                displayName: val(signupForm, 'displayName') || undefined,
            };

            setBusy(true, '가입하기');
            try {
                var r = await postJson(window.Api.URL.AUTH_SIGNUP, payload);
                if (r.status === 201) {
                    location.href = nextUrl();
                    return;
                }
                showError(r.data.message || '가입에 실패했습니다. 잠시 후 다시 시도해주세요.');
            } catch (err) {
                showError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
            } finally {
                setBusy(false, '가입하기');
            }
        });
    }

    // ─────── 로그인 폼 ───────
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            clearError();

            var payload = {
                username: val(loginForm, 'username'),
                password: loginForm.elements['password'].value,
            };

            setBusy(true, '로그인');
            try {
                var r = await postJson(window.Api.URL.AUTH_LOGIN, payload);
                if (r.status === 200) {
                    location.href = nextUrl();
                    return;
                }
                showError(r.data.message || '로그인에 실패했습니다.');
            } catch (err) {
                showError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
            } finally {
                setBusy(false, '로그인');
            }
        });
    }
})();
