// HTML 특수문자 이스케이프 — XSS 방어 핵심.
// 5문자 표준 (W3C escape charset): & < > " ' 모두 처리.
//
// 단순 3문자(& < >)만 처리하는 변형은 sql 식별자 안에 ' 같은 항목이
// 들어갔을 때 attribute 컨텍스트가 깨질 수 있어 위험. 항상 이 모듈 사용.
//
// 모든 HTML 페이지에서 다른 스크립트보다 먼저 로드되어야 함 (window.escapeHtml).
// editor-pure.js는 Node 테스트를 위해 자체 복사본을 유지하지만 동일 동작 보장.

(function () {
    'use strict';

    var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    window.escapeHtml = function (s) {
        return String(s).replace(/[&<>"']/g, function (m) { return MAP[m]; });
    };
})();
