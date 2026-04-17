'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatTimeoutResult, formatWarningResult } = require('../public/js/editor-pure.js');

describe('formatTimeoutResult', () => {
    it('5000ms → "5초" 메시지', () => {
        const r = formatTimeoutResult(5000);
        assert.equal(r.pass, false);
        assert.equal(r.timeout, true);
        assert.ok(r.diff.includes('5초'));
        assert.ok(r.diff.includes('시간 초과'));
    });

    it('비정수 초(2500ms=2.5초)도 처리', () => {
        const r = formatTimeoutResult(2500);
        assert.ok(r.diff.includes('2.5초'));
    });

    it('반환 구조: { pass:false, timeout:true, diff:string }', () => {
        const r = formatTimeoutResult(1000);
        assert.deepEqual(Object.keys(r).sort(), ['diff', 'pass', 'timeout']);
        assert.equal(typeof r.diff, 'string');
    });
});

describe('formatWarningResult', () => {
    it('type + title 기본 조합', () => {
        const r = formatWarningResult({ type: '오류', title: '런타임 에러' });
        assert.equal(r.error, true);
        assert.equal(r.errorMessage, '[오류] 런타임 에러');
    });

    it('message 있으면 " - " 구분자로 덧붙임', () => {
        const r = formatWarningResult({ type: '경고', title: 'A', message: 'B' });
        assert.equal(r.errorMessage, '[경고] A - B');
    });

    it('message 빈 문자열 → 구분자 생략', () => {
        const r = formatWarningResult({ type: '경고', title: 'A', message: '' });
        assert.equal(r.errorMessage, '[경고] A');
    });

    it('반환 구조: { error:true, errorMessage:string }', () => {
        const r = formatWarningResult({ type: 'x', title: 'y' });
        assert.deepEqual(Object.keys(r).sort(), ['error', 'errorMessage']);
    });
});
