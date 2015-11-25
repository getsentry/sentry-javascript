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
    iframe.contentWindow.eval('(' + execute.toString() + ')();');
}

describe('integration', function () {
    beforeEach(function (done) {
        var iframe = this.iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = './frame.html';
        iframe.onload = function () {
            done();
        };
        document.body.appendChild(iframe);
    });

    afterEach(function () {
        document.body.removeChild(this.iframe);
    });

    describe('native', function () {
        it('should capture exceptions from event listeners', function (done) {
            var iframe = this.iframe;

            iframeExecute(iframe, done,
                function () {
                    var div = document.createElement('div');
                    document.body.appendChild(div);
                    div.addEventListener('click', function () {
                        foo();
                    }, false);

                    // use setTimeout to "normalize" stack origin
                    setTimeout(function () {
                        var evt;
                        if (document.createEvent) {
                            evt = document.createEvent('MouseEvents');
                            evt.initEvent('click', true, false);
                            div.dispatchEvent(evt);
                        } else if(document.createEventObject) {
                            div.fireEvent('onclick');
                        }
                    });

                    setTimeout(done);
                },
                function () {
                    var ravenData = iframe.contentWindow.ravenData;
                    assert.equal(ravenData.exception.values[0].stacktrace.frames.length, 3);
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
                    assert.equal(ravenData.exception.values[0].stacktrace.frames.length, 2);
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
                    assert.equal(ravenData.exception.values[0].stacktrace.frames.length, 2);
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
                    assert.equal(ravenData.exception.values[0].stacktrace.frames.length, 2);
                }
            );
        });
    });
});
