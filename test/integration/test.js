/*global assert*/
function iframeExecute(iframe, done, execute, assertCallback) {
    iframe.contentWindow.done = function () {
        try {
            assertCallback(iframe);
            done();
        } catch (e) {
            done(e);
        }
    }
    // use setTimeout so stack trace doesn't go all the way back to mocha test runner
    iframe.contentWindow.eval('setTimeout(' + execute.toString() + ');');
}

function createIframe(done) {
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = './frame.html';
    iframe.onload = function () {
        done();
    };
    document.body.appendChild(iframe);
    return iframe;
}

describe('integration', function () {
    var timeoutStackDepth = 0;
    var eventHandlerStackDepth = 0;

    before(function (done) {
        // Before running any tests, throw/catch a known error
        // inside setTimeout to get a baseline expected stack
        // depth for future errors (this is different in every
        // browser).
        var iframe = createIframe(function () {
            iframe.contentWindow.setTimeout(function () {
                try {
                    iframe.contentWindow.foo();
                } catch (e) {
                    var trace = Raven.TraceKit.computeStackTrace(e);
                    timeoutStackDepth = trace.stack.length;
                }

                var doc = iframe.contentWindow.document;
                var div = doc.createElement('div');
                doc.body.appendChild(div);
                div.addEventListener('click', function () {
                    try {
                        foo();
                    } catch (e) {
                        var trace = Raven.TraceKit.computeStackTrace(e);
                        eventHandlerStackDepth = trace.stack.length;
                    }
                }, false);

                var evt;
                if (doc.createEvent) {
                    evt = doc.createEvent('MouseEvents');
                    evt.initEvent('click', true, false);
                    div.dispatchEvent(evt);
                } else if(doc.createEventObject) {
                    div.fireEvent('onclick');
                }

                document.body.removeChild(iframe);
                done();
            });
        });
    });

    beforeEach(function (done) {
        var iframe = this.iframe = createIframe(done);
    });

    afterEach(function () {
        document.body.removeChild(this.iframe);
    });

    describe('API', function () {
        it('should capture Raven.captureMessage', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    Raven.captureMessage('Hello');
                    done();
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData;
                    assert.equal(ravenData.message, 'Hello');
                }
            );
        });

        it('should capture Raven.captureException', function (done) {
            var iframe = this.iframe;
            iframeExecute(iframe, done,
                function () {
                    setTimeout(done);

                    try {
                        foo();
                    } catch (e) {
                        Raven.captureException(e);
                    }
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData;
                    assert.isAbove(ravenData.exception.values[0].stacktrace.frames.length, 1);
                }
            );
        });
    });
    describe('native', function () {
        it('should capture exceptions from event listeners', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    setTimeout(done);

                    var div = document.createElement('div');
                    document.body.appendChild(div);
                    div.addEventListener('click', function () {
                        foo();
                    }, false);

                    var evt;
                    if (document.createEvent) {
                        evt = document.createEvent('MouseEvents');
                        evt.initEvent('click', true, false);
                        div.dispatchEvent(evt);
                    } else if(document.createEventObject) {
                        div.fireEvent('onclick');
                    }
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData;
                    assert.equal(ravenData.exception.values[0].stacktrace.frames.length, eventHandlerStackDepth + 2);
                }
            );
        });

        it('should transparently remove event listeners from wrapped functions', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
              function () {
                  setTimeout(done);

                  var div = document.createElement('div');
                  document.body.appendChild(div);
                  var fooFn = function () { foo(); };
                  div.addEventListener('click', fooFn, false);
                  div.removeEventListener('click', fooFn);

                  var evt;
                  if (document.createEvent) {
                      evt = document.createEvent('MouseEvents');
                      evt.initEvent('click', true, false);
                      div.dispatchEvent(evt);
                  } else if(document.createEventObject) {
                      div.fireEvent('onclick');
                  }
              },
              function () {
                  var ravenData = iframe.contentWindow.ravenData;
                  assert.equal(ravenData, null); // should never trigger error
              }
            );
        });

        it('should capture exceptions inside setTimeout', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    setTimeout(function () {
                        setTimeout(done);
                        foo();
                    }, 10);
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData;
                    assert.equal(ravenData.exception.values[0].stacktrace.frames.length, timeoutStackDepth);
                }
            );
        });

        it('should capture exceptions inside setInterval', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    var exceptionInterval = setInterval(function () {
                        setTimeout(done);
                        clearInterval(exceptionInterval);
                        foo();
                    }, 10);
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData;
                    assert.equal(ravenData.exception.values[0].stacktrace.frames.length, timeoutStackDepth);
                }
            );
        });

        it('should capture exceptions inside requestAnimationFrame', function (done) {
            var iframe = this.iframe;
            // needs to be visible or requestAnimationFrame won't ever fire
            iframe.style.display = 'block';

            iframeExecute(iframe, done,
                function () {
                    requestAnimationFrame(function () {
                        setTimeout(done);
                        foo();
                    });
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData;
                    assert.equal(ravenData.exception.values[0].stacktrace.frames.length, timeoutStackDepth);
                }
            );
        });
    });
});
