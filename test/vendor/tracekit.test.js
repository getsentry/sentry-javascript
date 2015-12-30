/*jshint mocha:true*/
/*global Mocha, assert*/
'use strict';

var TraceKit = require('../../vendor/TraceKit/tracekit');

describe('TraceKit', function(){
    describe('stacktrace info', function() {
        it('should not remove anonymous functions from the stack', function() {
            // mock up an error object with a stack trace that includes both
            // named functions and anonymous functions
            var stack_str = "" +
                "  Error: \n" +
                "    at new <anonymous> (http://example.com/js/test.js:63)\n" + // stack[0]
                "    at namedFunc0 (http://example.com/js/script.js:10)\n" +    // stack[1]
                "    at http://example.com/js/test.js:65\n" +                   // stack[2]
                "    at namedFunc2 (http://example.com/js/script.js:20)\n" +    // stack[3]
                "    at http://example.com/js/test.js:67\n" +                   // stack[4]
                "    at namedFunc4 (http://example.com/js/script.js:100001)";   // stack[5]
            var mock_err = { stack: stack_str };
            var trace = TraceKit.computeStackTrace.computeStackTraceFromStackProp(mock_err);

            // Make sure TraceKit didn't remove the anonymous functions
            // from the stack like it used to :)
            assert.equal(trace.stack[0].func, 'new <anonymous>');
            assert.equal(trace.stack[1].func, 'namedFunc0');
            assert.equal(trace.stack[2].func, '?');
            assert.equal(trace.stack[3].func, 'namedFunc2');
            assert.equal(trace.stack[4].func, '?');
            assert.equal(trace.stack[5].func, 'namedFunc4');
        });

        it('should handle eval/anonymous strings in Chrome 46', function () {
            var stack_str = "" +
                "ReferenceError: baz is not defined\n" +
                "   at bar (http://example.com/js/test.js:19:7)\n" +
                "   at foo (http://example.com/js/test.js:23:7)\n" +
                "   at eval (eval at <anonymous> (http://example.com/js/test.js:26:5), <anonymous>:1:26)\n";

            var mock_err = { stack: stack_str };
            var trace = TraceKit.computeStackTrace.computeStackTraceFromStackProp(mock_err);
            assert.equal(trace.stack[0].func, 'bar');
            assert.equal(trace.stack[1].func, 'foo');
            assert.equal(trace.stack[2].func, 'eval');
        });
    });

    describe('.computeStackTrace', function() {
        it('should handle a native error object', function() {
            var ex = new Error('test');
            var stack = TraceKit.computeStackTrace(ex);
            assert.deepEqual(stack.name, 'Error');
            assert.deepEqual(stack.message, 'test');
        });

        it('should handle a native error object stack from Chrome', function() {
            var stackStr = "" +
            "Error: foo\n" +
            "    at <anonymous>:2:11\n" +
            "    at Object.InjectedScript._evaluateOn (<anonymous>:904:140)\n" +
            "    at Object.InjectedScript._evaluateAndWrap (<anonymous>:837:34)\n" +
            "    at Object.InjectedScript.evaluate (<anonymous>:693:21)";
            var mockErr = {
                name: 'Error',
                message: 'foo',
                stack: stackStr
            };
            var trace = TraceKit.computeStackTrace(mockErr);
            assert.deepEqual(trace.stack[0].url, '<anonymous>');
        });
    });

    describe('error notifications', function(){
        var testMessage = "__mocha_ignore__";
        var subscriptionHandler;
        // TraceKit waits 2000ms for window.onerror to fire, so give the tests
        // some extra time.
        this.timeout(3000);

        before(function() {
            // Prevent the onerror call that's part of our tests from getting to
            // mocha's handler, which would treat it as a test failure.
            //
            // We set this up here and don't ever restore the old handler, because
            // we can't do that without clobbering TraceKit's handler, which can only
            // be installed once.
            var oldOnError = window.onerror;
            window.onerror = function(message) {
                if (message == testMessage) {
                    return true;
                }
                return oldOnError.apply(this, arguments);
            };
        });

        afterEach(function() {
            if (subscriptionHandler) {
                TraceKit.report.unsubscribe(subscriptionHandler);
                subscriptionHandler = null;
            }
        });

        function testErrorNotification(collectWindowErrors, callOnError, numReports, done) {
            var extraVal = "foo";
            var numDone = 0;
            // TraceKit's collectWindowErrors flag shouldn't affect direct calls
            // to TraceKit.report, so we parameterize it for the tests.
            TraceKit.collectWindowErrors = collectWindowErrors;

            subscriptionHandler = function(stackInfo, extra) {
                assert.equal(extra, extraVal);
                numDone++;
                if (numDone == numReports) {
                    done();
                }
            };
            TraceKit.report.subscribe(subscriptionHandler);

            // TraceKit.report always throws an exception in order to trigger
            // window.onerror so it can gather more stack data. Mocha treats
            // uncaught exceptions as errors, so we catch it via assert.throws
            // here (and manually call window.onerror later if appropriate).
            //
            // We test multiple reports because TraceKit has special logic for when
            // report() is called a second time before either a timeout elapses or
            // window.onerror is called (which is why we always call window.onerror
            // only once below, after all calls to report()).
            for (var i=0; i < numReports; i++) {
                var e = new Error('testing');
                assert.throws(function() {
                    TraceKit.report(e, extraVal);
                }, e);
            }
            // The call to report should work whether or not window.onerror is
            // triggered, so we parameterize it for the tests. We only call it
            // once, regardless of numReports, because the case we want to test for
            // multiple reports is when window.onerror is *not* called between them.
            if (callOnError) {
                window.onerror(testMessage);
            }
        }

        Mocha.utils.forEach([false, true], function(collectWindowErrors) {
            Mocha.utils.forEach([false, true], function(callOnError) {
                Mocha.utils.forEach([1, 2], function(numReports) {
                    it('it should receive arguments from report() when' +
                       ' collectWindowErrors is ' + collectWindowErrors +
                       ' and callOnError is ' + callOnError +
                       ' and numReports is ' + numReports, function(done) {
                        testErrorNotification(collectWindowErrors, callOnError, numReports, done);
                    });
                });
            });
        });
    });
});
