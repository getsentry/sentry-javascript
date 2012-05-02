!function (global, QUnit) {

    function sourceFromStacktrace() {
        try {
            throw new Error();
        } catch ( e ) {
            var stack;
            if (e.stacktrace) {
                // Opera
                return e.stacktrace.split("\n")[6];
            } else if (e.stack) {
                // Firefox, Chrome
                stack = e.stack.split("\n");
                if (/^error$/i.test(stack[0])) stack.shift();
                return stack[3];
            } else if (e.sourceURL) {
                // Safari, PhantomJS
                // TODO sourceURL points at the 'throw new Error' line above, useless
                //return e.sourceURL + ":" + e.line;
            }
        }
    }

    var currentModule = ''
    ,   currentLogs = []
    ,   i
    ,   testi = 0
    ,   expect
    ,   runassertions
    ,   resultsEl = 0
    ,   done
    ,   logs
    ,   failed;

    function results() {
        return resultsEl || (resultsEl = document.getElementById('qunit-testresult'));
    }

    function complete() {
        results();

        if (!resultsEl) return;
        setTimeout(function () {
            if (resultsEl.className && resultsEl.className === 'result') {
                if (!done) {
                    done = true;
                    QUnit.logging.log(resultsEl.innerHTML.replace(/<\/?\w+(?:[\w\s="]+)>/g, ' '));
                }
            }
        }, 0);
    }

    QUnit.logging = {
        logFailed: true,
        logPassed: false,
        tabChar: '    ',
        testStart: function (a) { console.log(a) },
        testEnd: function (a) { console.log(); },
        log: function (a) { console.log(a) },
        assertStart: function (a) { },
        assertEnd: function (a) { },
        error: function (a) { console.log(a) }
    };

    function indent(i) { return (new Array(i || 1)).join(QUnit.logging.tabChar) }

    function tabUp(s, i) { return ('\n'+s).replace(/\n/g, '\n' + indent(i)) }

    var QUnitModule = QUnit.module;
    QUnit.module = function (m) {
        currentModule = m + ': ';
        return QUnitModule.apply(this, arguments);
    };
    global.module = QUnit.module;

    var QUnitExpect = QUnit.expect;
    QUnit.expect = function (a) {
        expect = a;
        return QUnitExpect.apply(this, arguments);
    };
    global.expect = QUnit.expect;

    var QUnitTest = QUnit.test;
    QUnit.test = function(testName, expected, callback, async) {
        if ( arguments.length === 2 ) {
            callback = expected;
            expected = null;
        }

        var newcallback = function (callback) {
            return function () {
                i = 0;
                runassertions = 0;
                expect = expected || 0;
                logs = [];
                failed = false;
                logs.push(['testStart', '' + (++testi) + '. ' + currentModule + testName]);
                callback.call(this);
                if (expect > runassertions) {
                    logs.push(['error', indent(1) + (++i) + '. Expected ' + expect + ' assertions, but ' + runassertions + ' were run']);
                }
                if (QUnit.logging[failed ? 'logFailed' : 'logPassed'] === true) {
                    var log;
                    while ((log = logs.shift())) {
                        if (log[0] === 'testStart' && failed) {
                            log[1] += ' >>> FAILED!';
                        }
                        QUnit.logging[log[0]](log[1]);
                    }
                    QUnit.logging.testEnd();
                }
                complete();
            }
        };

        return arguments.length === 2 ?
            QUnitTest.call(this, testName, newcallback(callback, expected)):
            QUnitTest.call(this, testName, expected, newcallback(callback, expected), async);
    };
    global.test = QUnit.test;

    var QUnitPush = QUnit.push;
    QUnit.push = function (result, actual, expected, message) {
        var source
        ,   nexpected = QUnit.jsDump.parse(expected)
        ,   nactual = QUnit.jsDump.parse(actual)
        ,   log = '';

        failed = failed || !result;

        ++runassertions;

        logs.push(['assertStart', null]);

        log += indent(2) + (++i) + '. ' + (message || (failed ? "okay" : "failed")) + (result ? '': ' >>> FAILED!');
        log += "\n" + indent(3) + 'Expected:' + tabUp(nexpected, 4);

        if (nexpected != nactual) {
            log += "\n" + indent(3) + 'Result:' + tabUp(nactual, 4);

            var diff = QUnit.diff(nexpected, nactual);
            diff = diff.replace(/<\/ins><ins>/g, '').replace(/<\/del><del>/g, '').
                replace(/<\/?(ins|del)>/g, function (rep) {
                    var ret = rep.match('del') ? '-' : '+';
                    return (rep.match(/^<\//) ? ret + '}' : '{' + ret);
                });

            log += "\n" + indent(3) + 'Diff:' + tabUp(diff, 4);
        }

        if (!result && (source = sourceFromStacktrace()) ) {
            log += "\n" + indent(3) + 'Source:' + tabUp(String(source).replace(/^\s+/, ''), 4);
        }

        logs.push([result ? 'log' : 'error', log]);
        logs.push(['assertEnd', null]);

        return QUnitPush.apply(this, arguments);
    };

}(this, QUnit)