/* ============================================================
   editor-pure.js — Entry 에디터의 순수(pure) 함수 모음
   Entry 라이브러리나 DOM 의존성 없음 → Node에서 단독 테스트 가능.
   반드시 editor.js 보다 먼저 로드되어야 합니다.
   ============================================================ */

// HTML 특수문자 이스케이프. XSS 방지 핵심 — 사용자 입력이나 문제 이름이
// innerHTML로 주입되기 전에 반드시 거쳐야 함.
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Minimal Markdown renderer (headings, bold, italic, inline code, code block, lists).
// 특징:
//  - 모든 텍스트는 escape() 통과 → XSS 안전
//  - 인라인 링크·이미지 미지원 (문제 설명에 불필요)
//  - 중첩 리스트 미지원 (한 단계만)
function renderMarkdown(md) {
    if (!md) return '';
    var escape = function (s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    var lines = md.split('\n');
    var html = '', inCode = false, inList = false, listType = '';
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        // Code block
        var codeMatch = line.match(/^```(\w*)/);
        if (codeMatch) {
            if (inCode) { html += '</code></pre>'; inCode = false; }
            else { html += '<pre><code>'; inCode = true; }
            continue;
        }
        if (inCode) { html += escape(line) + '\n'; continue; }
        // Headings
        var h = line.match(/^(#{1,3})\s+(.+)/);
        if (h) {
            if (inList) { html += '</' + listType + '>'; inList = false; }
            html += '<h' + h[1].length + '>' + escape(h[2]) + '</h' + h[1].length + '>';
            continue;
        }
        // Lists
        var ul = line.match(/^[\-\*]\s+(.+)/);
        var ol = line.match(/^\d+\.\s+(.+)/);
        if (ul || ol) {
            var curType = ul ? 'ul' : 'ol';
            if (!inList) { html += '<' + curType + '>'; inList = true; listType = curType; }
            else if (listType !== curType) {
                html += '</' + listType + '><' + curType + '>'; listType = curType;
            }
            html += '<li>' + inlineMd((ul || ol)[1]) + '</li>';
            continue;
        }
        if (inList) { html += '</' + listType + '>'; inList = false; }
        // Empty line
        if (!line.trim()) continue;
        // Paragraph
        html += '<p>' + inlineMd(line) + '</p>';
    }
    if (inList) html += '</' + listType + '>';
    if (inCode) html += '</code></pre>';
    return html;

    function inlineMd(s) {
        return escape(s)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }
}

// 리스트 값 정규화: 숫자처럼 보이는 문자열 → 숫자.
// Entry 변수는 입력 방식에 따라 "10" vs 10 처럼 타입이 갈리는데, 채점에서는
// 의미가 같으면 통과로 판정하기 위해 이 함수로 정규화 후 비교한다.
function normalizeValue(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) return Number(v);
    return v;
}

// 두 리스트가 의미적으로 동일한지 (길이 + 정규화된 원소 순서 일치).
function listsEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
        if (normalizeValue(a[i]) !== normalizeValue(b[i])) return false;
    }
    return true;
}

// 타임아웃 결과 메시지 생성 (순수).
function formatTimeoutResult(timeoutMs) {
    var secondsStr = (timeoutMs / 1000).toString();
    return {
        pass: false,
        timeout: true,
        diff: '시간 초과 (' + secondsStr + '초) — 무한 반복이나 너무 느린 연산 가능성'
    };
}

// 경고/오류 결과 메시지 생성 (순수).
function formatWarningResult(warning) {
    return {
        error: true,
        errorMessage: '[' + warning.type + '] ' + warning.title +
            (warning.message ? ' - ' + warning.message : '')
    };
}

// 채점 평가: testCase의 expected vs 실제 실행 결과(sayLog + finalState) 비교.
// 반환:
//  - { pass: true }                              — 전부 통과
//  - { pass: false, diff: '<HTML 문자열>' }     — 실패 사유를 span 태그로 감싼 HTML
function evaluateTest(testCase, sayLog, finalState) {
    var expected = testCase.expected || {};
    var failures = [];
    finalState = finalState || { variables: {}, lists: {} };

    // Check say outputs
    if (expected.say) {
        var actualSays = sayLog.map(function (s) { return s.message; });
        expected.say.forEach(function (expectedMsg) {
            var found = actualSays.some(function (actual) {
                return actual === expectedMsg || actual.indexOf(expectedMsg) !== -1;
            });
            if (!found) {
                failures.push({
                    type: 'say',
                    expected: expectedMsg,
                    actual: actualSays.length ? actualSays.join(', ') : '(말하기 없음)'
                });
            }
        });
    }

    // Check variable values (captured before stop)
    if (expected.variables) {
        Object.keys(expected.variables).forEach(function (vName) {
            var actualRaw = finalState.variables.hasOwnProperty(vName) ? finalState.variables[vName] : null;
            var actual = actualRaw === null ? '(없음)' : String(actualRaw);
            var exp = String(expected.variables[vName]);
            if (actual !== exp) {
                failures.push({ type: 'variable', name: vName, expected: exp, actual: actual });
            }
        });
    }

    // Check list values (captured before stop)
    if (expected.lists) {
        Object.keys(expected.lists).forEach(function (lName) {
            var actualArr = finalState.lists[lName];
            var expArr = expected.lists[lName];
            if (!actualArr) {
                failures.push({ type: 'list', name: lName, expected: JSON.stringify(expArr), actual: '(리스트 없음)' });
            } else if (!listsEqual(actualArr, expArr)) {
                failures.push({
                    type: 'list',
                    name: lName,
                    expected: JSON.stringify(expArr),
                    actual: JSON.stringify(actualArr.map(function(v){ return normalizeValue(v); }))
                });
            }
        });
    }

    if (failures.length === 0) {
        return { pass: true };
    }

    var diffHtml = failures.map(function (f) {
        if (f.type === 'say') {
            return '말하기: <span class="expected">기대: "' + escapeHtml(f.expected) + '"</span> / <span class="actual">실제: ' + escapeHtml(f.actual) + '</span>';
        } else if (f.type === 'list') {
            return '리스트 "' + escapeHtml(f.name) + '": <span class="expected">기대: ' + escapeHtml(f.expected) + '</span> / <span class="actual">실제: ' + escapeHtml(f.actual) + '</span>';
        } else {
            return '변수 "' + escapeHtml(f.name) + '": <span class="expected">기대: ' + escapeHtml(f.expected) + '</span> / <span class="actual">실제: ' + escapeHtml(f.actual) + '</span>';
        }
    }).join('<br>');
    return { pass: false, diff: diffHtml };
}

// ============================================================
// Module export — CommonJS (Node) only. 브라우저에서는 전역 함수로 노출됨.
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHtml: escapeHtml,
        renderMarkdown: renderMarkdown,
        normalizeValue: normalizeValue,
        listsEqual: listsEqual,
        formatTimeoutResult: formatTimeoutResult,
        formatWarningResult: formatWarningResult,
        evaluateTest: evaluateTest
    };
}
