'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, renderMarkdown } = require('../public/js/editor-pure.js');

describe('escapeHtml', () => {
    it('plain text 그대로', () => {
        assert.equal(escapeHtml('hello'), 'hello');
    });

    it('< > & 이스케이프', () => {
        assert.equal(escapeHtml('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
    });

    it('<script> 태그 무력화', () => {
        assert.equal(
            escapeHtml('<script>alert(1)</script>'),
            '&lt;script&gt;alert(1)&lt;/script&gt;'
        );
    });

    it('& 먼저 이스케이프되어야 함 (&amp; → &amp;amp; 중복 방지)', () => {
        // 올바른 순서: & → &amp; 먼저, 그 다음 < > 처리
        assert.equal(escapeHtml('&lt;'), '&amp;lt;');
    });

    it('숫자/null/undefined도 문자열 변환', () => {
        assert.equal(escapeHtml(42), '42');
        assert.equal(escapeHtml(null), 'null');
        assert.equal(escapeHtml(undefined), 'undefined');
    });
});

describe('renderMarkdown', () => {
    it('빈/null 입력 → 빈 문자열', () => {
        assert.equal(renderMarkdown(''), '');
        assert.equal(renderMarkdown(null), '');
        assert.equal(renderMarkdown(undefined), '');
    });

    it('일반 문단은 <p>로 감쌈', () => {
        const out = renderMarkdown('안녕하세요');
        assert.ok(out.includes('<p>안녕하세요</p>'));
    });

    it('# 헤딩 1~3 레벨', () => {
        assert.ok(renderMarkdown('# A').includes('<h1>A</h1>'));
        assert.ok(renderMarkdown('## B').includes('<h2>B</h2>'));
        assert.ok(renderMarkdown('### C').includes('<h3>C</h3>'));
    });

    it('**bold** → <strong>', () => {
        assert.ok(renderMarkdown('**hello**').includes('<strong>hello</strong>'));
    });

    it('*italic* → <em>', () => {
        assert.ok(renderMarkdown('*hello*').includes('<em>hello</em>'));
    });

    it('`inline code` → <code>', () => {
        assert.ok(renderMarkdown('`x = 1`').includes('<code>x = 1</code>'));
    });

    it('```\\ncode\\n```  → <pre><code>', () => {
        const out = renderMarkdown('```\nx = 1\n```');
        assert.ok(out.includes('<pre><code>'));
        assert.ok(out.includes('x = 1'));
        assert.ok(out.includes('</code></pre>'));
    });

    it('- unordered list', () => {
        const out = renderMarkdown('- a\n- b');
        assert.ok(out.includes('<ul>'));
        assert.ok(out.includes('<li>a</li>'));
        assert.ok(out.includes('<li>b</li>'));
        assert.ok(out.includes('</ul>'));
    });

    it('1. ordered list', () => {
        const out = renderMarkdown('1. first\n2. second');
        assert.ok(out.includes('<ol>'));
        assert.ok(out.includes('<li>first</li>'));
        assert.ok(out.includes('</ol>'));
    });

    // XSS 방어 테스트 — 가장 중요
    it('XSS: HTML 태그 이스케이프 (inline)', () => {
        const out = renderMarkdown('<img src=x onerror=alert(1)>');
        assert.ok(out.includes('&lt;img'));
        assert.ok(!out.includes('<img'));
    });

    it('XSS: 코드 블록 내부도 이스케이프', () => {
        const out = renderMarkdown('```\n<script>alert(1)</script>\n```');
        assert.ok(out.includes('&lt;script&gt;'));
        assert.ok(!out.includes('<script>alert'));
    });

    it('XSS: 인라인 코드도 이스케이프', () => {
        const out = renderMarkdown('`<b>x</b>`');
        assert.ok(out.includes('&lt;b&gt;'));
    });

    it('XSS: 헤딩 본문도 이스케이프', () => {
        const out = renderMarkdown('# <script>');
        assert.ok(out.includes('&lt;script&gt;'));
        assert.ok(!out.includes('<script>'));
    });
});
