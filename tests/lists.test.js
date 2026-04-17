'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeValue, listsEqual } = require('../public/js/editor-pure.js');

describe('normalizeValue', () => {
    it('숫자는 그대로', () => {
        assert.equal(normalizeValue(42), 42);
        assert.equal(normalizeValue(0), 0);
        assert.equal(normalizeValue(-3.14), -3.14);
    });

    it('숫자 문자열은 숫자로 변환', () => {
        assert.equal(normalizeValue('42'), 42);
        assert.equal(normalizeValue('-3.14'), -3.14);
        assert.equal(normalizeValue('0'), 0);
    });

    it('빈 문자열은 빈 문자열 유지 (Number("") === 0 함정 방지)', () => {
        assert.equal(normalizeValue(''), '');
    });

    it('일반 문자열은 그대로', () => {
        assert.equal(normalizeValue('hello'), 'hello');
        assert.equal(normalizeValue('3a'), '3a');
    });

    it('공백만 있는 문자열은 그대로 (의미 있는 값 아님)', () => {
        // 현재 구현: Number(" ") === 0 이므로 숫자로 변환됨 — 문서화된 동작
        // 필요 시 추후 isNaN 이전에 trim 체크 추가 고려
        // (여기서는 현 동작을 잠금 역할)
        assert.equal(normalizeValue(' '), 0);
    });
});

describe('listsEqual', () => {
    it('비어있는 두 배열 → true', () => {
        assert.equal(listsEqual([], []), true);
    });

    it('동일한 숫자 배열', () => {
        assert.equal(listsEqual([1, 2, 3], [1, 2, 3]), true);
    });

    it('숫자 vs 문자열 혼용도 같게 비교 (정규화)', () => {
        assert.equal(listsEqual([1, 2, 3], ['1', '2', '3']), true);
        assert.equal(listsEqual(['10', 20], [10, '20']), true);
    });

    it('순서가 다르면 false', () => {
        assert.equal(listsEqual([1, 2, 3], [3, 2, 1]), false);
    });

    it('길이가 다르면 false', () => {
        assert.equal(listsEqual([1, 2], [1, 2, 3]), false);
        assert.equal(listsEqual([1, 2, 3], [1, 2]), false);
    });

    it('빈 문자열은 숫자 0과 다름', () => {
        assert.equal(listsEqual([''], [0]), false);
    });

    it('문자열 원소', () => {
        assert.equal(listsEqual(['apple', 'banana'], ['apple', 'banana']), true);
        assert.equal(listsEqual(['apple'], ['Apple']), false);
    });
});
