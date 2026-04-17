'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateTest } = require('../public/js/editor-pure.js');

// 편의: sayLog 포맷은 [{ message, mode }]
function sayLogOf(...messages) {
    return messages.map(m => ({ message: String(m), mode: 'speak' }));
}

describe('evaluateTest — say 비교', () => {
    it('정확히 일치하는 말하기 → 통과', () => {
        const tc = { expected: { say: ['안녕'] } };
        assert.deepEqual(evaluateTest(tc, sayLogOf('안녕'), {}), { pass: true });
    });

    it('부분 포함도 통과 (indexOf 매칭)', () => {
        const tc = { expected: { say: ['안녕'] } };
        const log = sayLogOf('안녕하세요, 세상!');
        assert.deepEqual(evaluateTest(tc, log, {}), { pass: true });
    });

    it('여러 말하기 기대값 전부 일치', () => {
        const tc = { expected: { say: ['A', 'B'] } };
        const log = sayLogOf('A', 'B');
        assert.equal(evaluateTest(tc, log, {}).pass, true);
    });

    it('말하기 없을 때 실패 diff에 "(말하기 없음)"', () => {
        const tc = { expected: { say: ['안녕'] } };
        const r = evaluateTest(tc, [], {});
        assert.equal(r.pass, false);
        assert.ok(r.diff.includes('말하기 없음'));
    });

    it('기대값 불일치 → 실패', () => {
        const tc = { expected: { say: ['안녕'] } };
        const r = evaluateTest(tc, sayLogOf('잘가'), {});
        assert.equal(r.pass, false);
        assert.ok(r.diff.includes('기대'));
        assert.ok(r.diff.includes('실제'));
    });
});

describe('evaluateTest — 변수 비교', () => {
    it('숫자 변수 일치', () => {
        const tc = { expected: { variables: { x: 10 } } };
        const state = { variables: { x: 10 }, lists: {} };
        assert.deepEqual(evaluateTest(tc, [], state), { pass: true });
    });

    it('타입 다른 동일값: 10 vs "10" 통과 (String() 정규화)', () => {
        const tc = { expected: { variables: { x: '10' } } };
        const state = { variables: { x: 10 }, lists: {} };
        assert.equal(evaluateTest(tc, [], state).pass, true);
    });

    it('변수 없을 때 "(없음)" 처리', () => {
        const tc = { expected: { variables: { x: 5 } } };
        const state = { variables: {}, lists: {} };
        const r = evaluateTest(tc, [], state);
        assert.equal(r.pass, false);
        assert.ok(r.diff.includes('없음'));
    });

    it('여러 변수 중 하나라도 틀리면 실패', () => {
        const tc = { expected: { variables: { a: 1, b: 2 } } };
        const state = { variables: { a: 1, b: 99 }, lists: {} };
        assert.equal(evaluateTest(tc, [], state).pass, false);
    });
});

describe('evaluateTest — 리스트 비교', () => {
    it('동일 리스트 통과', () => {
        const tc = { expected: { lists: { L: [1, 2, 3] } } };
        const state = { variables: {}, lists: { L: [1, 2, 3] } };
        assert.equal(evaluateTest(tc, [], state).pass, true);
    });

    it('문자열/숫자 혼용은 정규화로 통과', () => {
        const tc = { expected: { lists: { L: [1, 2, 3] } } };
        const state = { variables: {}, lists: { L: ['1', '2', '3'] } };
        assert.equal(evaluateTest(tc, [], state).pass, true);
    });

    it('리스트 없을 때 "(리스트 없음)" 표시', () => {
        const tc = { expected: { lists: { L: [1] } } };
        const r = evaluateTest(tc, [], { variables: {}, lists: {} });
        assert.equal(r.pass, false);
        assert.ok(r.diff.includes('리스트 없음'));
    });

    it('순서 다르면 실패', () => {
        const tc = { expected: { lists: { L: [1, 2, 3] } } };
        const state = { variables: {}, lists: { L: [3, 2, 1] } };
        assert.equal(evaluateTest(tc, [], state).pass, false);
    });
});

describe('evaluateTest — 복합 / 엣지', () => {
    it('expected 비어있으면 항상 통과', () => {
        const tc = { expected: {} };
        assert.deepEqual(evaluateTest(tc, [], {}), { pass: true });
    });

    it('expected 미지정(undefined)도 통과', () => {
        assert.deepEqual(evaluateTest({}, [], {}), { pass: true });
    });

    it('finalState undefined 안전 (기본값 사용)', () => {
        const tc = { expected: { variables: { x: 1 } } };
        const r = evaluateTest(tc, [], undefined);
        assert.equal(r.pass, false); // 변수 없어서 실패
        assert.ok(r.diff.includes('없음'));
    });

    it('say + 변수 + 리스트 모두 일치 → 통과', () => {
        const tc = {
            expected: {
                say: ['hi'],
                variables: { x: 1 },
                lists: { L: [1, 2] }
            }
        };
        const state = { variables: { x: 1 }, lists: { L: [1, 2] } };
        assert.equal(evaluateTest(tc, sayLogOf('hi'), state).pass, true);
    });

    it('여러 실패 사유는 <br>로 연결', () => {
        const tc = {
            expected: { say: ['A'], variables: { x: 1 } }
        };
        const r = evaluateTest(tc, sayLogOf('B'), { variables: { x: 2 }, lists: {} });
        assert.equal(r.pass, false);
        assert.ok(r.diff.includes('<br>'));
    });

    it('diff HTML에 <span class="expected"> / <span class="actual"> 포함', () => {
        const tc = { expected: { variables: { x: 1 } } };
        const r = evaluateTest(tc, [], { variables: { x: 2 }, lists: {} });
        assert.ok(r.diff.includes('<span class="expected">'));
        assert.ok(r.diff.includes('<span class="actual">'));
    });

    it('XSS: 변수 이름에 HTML 태그 있어도 이스케이프', () => {
        const tc = { expected: { variables: { '<script>': 1 } } };
        const r = evaluateTest(tc, [], { variables: {}, lists: {} });
        assert.ok(r.diff.includes('&lt;script&gt;'));
        assert.ok(!r.diff.includes('<script>'));
    });
});
