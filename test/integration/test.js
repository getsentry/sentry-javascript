/*global assert*/
function iframeExecute(iframe, done, execute, assertCallback) {
    iframe.contentWindow.done = function () {
        try {
            assertCallback(iframe);
            done();
        } catch (e) {
            done(e);
        }
    };
    // use setTimeout so stack trace doesn't go all the way back to mocha test runner
    iframe.contentWindow.eval('window.originalBuiltIns.setTimeout.call(window, ' + execute.toString() + ');');
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

    beforeEach(function (done) {
        this.iframe = createIframe(done);
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
                    var ravenData = iframe.contentWindow.ravenData[0];
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
                    var ravenData = iframe.contentWindow.ravenData[0];
                    assert.isAbove(ravenData.exception.values[0].stacktrace.frames.length, 1);
                }
            );
        });
    });

    describe('window.onerror', function () {
        it('should catch syntax errors', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    setTimeout(done);
                    eval('foo{};');
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData[0];
                    assert.isTrue(/SyntaxError/.test(ravenData.message)); // full message differs per-browser
                    assert.equal(ravenData.exception.values[0].stacktrace.frames.length, 1); // just one frame
                }
            );
        });

        it('should NOT catch an exception already caught via Raven.wrap', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    setTimeout(done);
                    Raven.wrap(function () {
                        foo();
                    })();
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData;
                    assert.equal(ravenData.length, 1); // one caught error
                }
            );
        });

        it('should catch an exception already caught [but rethrown] via Raven.captureException', function (done) {
            // unlike Raven.wrap which ALWAYS re-throws, we don't know if the user will
            // re-throw an exception passed to Raven.captureException, and so we cannot
            // automatically suppress the next error caught through window.onerror
            var iframe = this.iframe;
            iframeExecute(iframe, done,
                function () {
                    setTimeout(done);
                    try {
                        foo();
                    } catch (e) {
                        Raven.captureException(e);
                        throw e; // intentionally re-throw
                    }
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData;
                    assert.equal(ravenData.length, 2);
                }
            );
        });
    });

    describe('wrapped built-ins', function () {
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
                    var ravenData = iframe.contentWindow.ravenData[0];
                    assert.isAbove(ravenData.exception.values[0].stacktrace.frames.length, 2);
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
                  var ravenData = iframe.contentWindow.ravenData[0];
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
                    var ravenData = iframe.contentWindow.ravenData[0];
                    assert.isAbove(ravenData.exception.values[0].stacktrace.frames.length, 2);
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
                    var ravenData = iframe.contentWindow.ravenData[0];
                    assert.isAbove(ravenData.exception.values[0].stacktrace.frames.length, 2);
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
                    var ravenData = iframe.contentWindow.ravenData[0];
                    assert.isAbove(ravenData.exception.values[0].stacktrace.frames.length, 2);
                }
            );
        });

        it('should capture exceptions from XMLHttpRequest event handlers (e.g. onreadystatechange)', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
              function () {
                  var xhr = new XMLHttpRequest();

                  // intentionally assign event handlers *after* XMLHttpRequest.prototype.open,
                  // since this is what jQuery does
                  // https://github.com/jquery/jquery/blob/master/src/ajax/xhr.js#L37

                  xhr.open('GET', 'example.json')
                  xhr.onreadystatechange = function () {
                      setTimeout(done);
                      // replace onreadystatechange with no-op so exception doesn't
                      // fire more than once as XHR changes loading state
                      xhr.onreadystatechange = function () {};
                      foo();
                  };
                  xhr.send();
              },
              function () {
                  var ravenData = iframe.contentWindow.ravenData[0];
                  // # of frames alter significantly between chrome/firefox & safari
                  assert.isAbove(ravenData.exception.values[0].stacktrace.frames.length, 2);
              }
            );
        });

        it('should capture exceptions from $.fn.ready (jQuery)', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    setTimeout(done);

                    $(function () {
                        foo();
                    });
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData[0];
                    // # of frames alter significantly between chrome/firefox & safari
                    assert.isAbove(ravenData.exception.values[0].stacktrace.frames.length, 2);
                }
            );
        });
    });

    describe('uninstall', function () {
        it('should restore original built-ins', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    setTimeout(done);
                    Raven.uninstall();

                    window.isRestored = {
                        setTimeout: originalBuiltIns.setTimeout === setTimeout,
                        setInterval: originalBuiltIns.setInterval === setInterval,
                        requestAnimationFrame: originalBuiltIns.requestAnimationFrame === requestAnimationFrame,
                        xhrProtoOpen: originalBuiltIns.xhrProtoOpen === XMLHttpRequest.prototype.open,
                        headAddEventListener: originalBuiltIns.headAddEventListener === document.body.addEventListener,
                        headRemoveEventListener: originalBuiltIns.headRemoveEventListener === document.body.removeEventListener
                    };
                },
                function () {
                    var isRestored = iframe.contentWindow.isRestored;
                    assert.isTrue(isRestored.setTimeout);
                    assert.isTrue(isRestored.setInterval);
                    assert.isTrue(isRestored.requestAnimationFrame);
                    assert.isTrue(isRestored.xhrProtoOpen);
                    assert.isTrue(isRestored.headAddEventListener);
                    assert.isTrue(isRestored.headRemoveEventListener);
                }
            );
        });

        it('should not restore XMLHttpRequest instance methods', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    setTimeout(done);

                    var xhr = new XMLHttpRequest();
                    var origOnReadyStateChange = xhr.onreadystatechange = function () {};
                    xhr.open('GET', '/foo/');
                    xhr.abort();

                    Raven.uninstall();

                    window.isOnReadyStateChangeRestored = xhr.onready === origOnReadyStateChange;
                },
                function () {
                    assert.isFalse(iframe.contentWindow.isOnReadyStateChangeRestored);
                }
            );
        });
    });
});
