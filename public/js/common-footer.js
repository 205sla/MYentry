/* ============================================================
   common-footer.js — 모든 정적 페이지(index·contribute·privacy·terms)에
   <body> 끝 푸터를 동적으로 삽입.
   <script src="js/common-footer.js"> 를 </body> 직전에 배치하면
   해당 위치에 <footer class="disclaimer">가 생긴다.
   editor.html은 푸터가 없으므로 이 스크립트를 포함하지 않는다.
   ============================================================ */

(function () {
    var footer = document.createElement('footer');
    footer.className = 'disclaimer';
    footer.innerHTML =
        '<a href="/privacy.html">개인정보 처리방침</a> · <a href="/terms.html">이용약관</a>' +
        ' · 본 사이트는 <a href="https://playentry.org" target="_blank" rel="noopener noreferrer">엔트리(entry)</a>의 공식 서비스가 아닙니다.' +
        ' · <a href="https://github.com/205sla/CODE-205" target="_blank" rel="noopener noreferrer">소스코드(GitHub)</a>' +
        '<div class="entry-credit">엔트리 블록 이미지 및 <a href="https://github.com/entrylabs" target="_blank" rel="noopener noreferrer">오픈소스</a> 사용 — Copyright &copy; NAVER Connect Foundation. Some Rights Reserved.</div>' +
        '<div class="tm-notice">&ldquo;205&rdquo;<sup>&reg;</sup>는 등록 상표입니다. (출원 40-2023-0165693)</div>';
    document.body.appendChild(footer);
})();
