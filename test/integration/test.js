/*global assert*/
function iframeExecute(iframe, done, execute, assertCallback) {
  iframe.contentWindow.done = function() {
    try {
      assertCallback(iframe);
      done();
    } catch (e) {
      done(e);
    }
  };
  // use setTimeout so stack trace doesn't go all the way back to mocha test runner
  iframe.contentWindow.eval(
    'window.originalBuiltIns.setTimeout.call(window, ' + execute.toString() + ');'
  );
}

function createIframe(done) {
  var iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = './frame.html';
  iframe.onload = function() {
    done();
  };
  document.body.appendChild(iframe);
  return iframe;
}

var anchor = document.createElement('a');
function parseUrl(url) {
  var out = {pathname: '', origin: '', protocol: ''};
  if (!url) anchor.href = url;
  for (var key in out) {
    out[key] = anchor[key];
  }
  return out;
}

function isBelowIE11() {
  return /*@cc_on!@*/ false == !false;
}

function isEdge14() {
  return window.navigator.userAgent.indexOf('Edge/14') !== -1;
}

describe('integration', function() {
  this.timeout(10000);

  beforeEach(function(done) {
    this.iframe = createIframe(done);
  });

  afterEach(function() {
    document.body.removeChild(this.iframe);
  });

  describe('API', function() {
    it('should capture Raven.captureMessage', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          Raven.captureMessage('Hello');
          done();
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.equal(ravenData.message, 'Hello');
        }
      );
    });

    it('should capture Raven.captureException', function(done) {
      var iframe = this.iframe;
      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          try {
            foo();
          } catch (e) {
            Raven.captureException(e);
          }
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.isAtLeast(ravenData.exception.values[0].stacktrace.frames.length, 2);
          assert.isAtMost(ravenData.exception.values[0].stacktrace.frames.length, 4);
        }
      );
    });

    it('should generate a synthetic trace for captureException w/ non-errors', function(
      done
    ) {
      var iframe = this.iframe;
      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          Raven.captureException({foo: 'bar'});
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.isAtLeast(ravenData.stacktrace.frames.length, 1);
          assert.isAtMost(ravenData.stacktrace.frames.length, 3);

          // verify trimHeadFrames hasn't slipped into final payload
          assert.isUndefined(ravenData.trimHeadFrames);
        }
      );
    });

    it('should capture an Error object passed to Raven.captureException w/ maxMessageLength set (#647)', function(
      done
    ) {
      var iframe = this.iframe;
      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          Raven._globalOptions.maxMessageLength = 100;
          Raven.captureException(new Error('lol'), {
            level: 'warning',
            extra: {
              foo: 'bar'
            }
          });
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.equal(ravenData.exception.values[0].type, 'Error');
          assert.equal(ravenData.exception.values[0].value, 'lol');
          assert.equal(ravenData.exception.values[0].stacktrace.frames.length, 1);
        }
      );
    });

    it('should reject duplicate, back-to-back errors from captureError', function(done) {
      var iframe = this.iframe;
      iframeExecute(
        iframe,
        done,
        function() {
          Raven._breadcrumbs = [];

          var count = 5;
          setTimeout(function invoke() {
            // use setTimeout to capture new error objects that have
            // identical stack traces (can't call sequentially or callsite
            // line number will change)
            //
            // order:
            //   Error: foo
            //   Error: foo (suppressed)
            //   Error: foo (suppressed)
            //   Error: bar
            //   Error: foo
            if (count === 2) {
              Raven.captureException(new Error('bar'));
            } else {
              Raven.captureException(new Error('foo'));
            }

            if (count-- === 0) return void done();
            else setTimeout(invoke);
          });
        },
        function() {
          var breadcrumbs = iframe.contentWindow.Raven._breadcrumbs;
          // use breadcrumbs to evaluate which errors were sent
          // NOTE: can't use ravenData because duplicate error suppression occurs
          //       AFTER dataCallback/shouldSendCallback (dataCallback will record
          //       duplicates but they ultimately won't be sent)
          assert.equal(breadcrumbs.length, 3);
          assert.equal(breadcrumbs[0].message, 'Error: foo');
          assert.equal(breadcrumbs[1].message, 'Error: bar');
          assert.equal(breadcrumbs[2].message, 'Error: foo');
        }
      );
    });

    it('should not reject back-to-back errors with different stack traces', function(
      done
    ) {
      var iframe = this.iframe;
      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);
          Raven._breadcrumbs = [];

          // same error message, but different stacks means that these are considered
          // different errors

          // stack:
          //   bar
          try {
            bar(); // declared in frame.html
          } catch (e) {
            Raven.captureException(e);
          }

          // stack (different # frames):
          //   bar
          //   foo
          try {
            foo(); // declared in frame.html
          } catch (e) {
            Raven.captureException(e);
          }

          // stack (same # frames, different frames):
          //   bar
          //   foo2
          try {
            foo2(); // declared in frame.html
          } catch (e) {
            Raven.captureException(e);
          }
        },
        function() {
          var breadcrumbs = iframe.contentWindow.Raven._breadcrumbs;
          assert.equal(breadcrumbs.length, 3);
          // NOTE: regex because exact error message differs per-browser
          assert.match(breadcrumbs[0].message, /^ReferenceError.*baz/);
          assert.match(breadcrumbs[1].message, /^ReferenceError.*baz/);
          assert.match(breadcrumbs[2].message, /^ReferenceError.*baz/);
        }
      );
    });

    it('should reject duplicate, back-to-back messages from captureMessage', function(
      done
    ) {
      var iframe = this.iframe;
      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          Raven._breadcrumbs = [];

          Raven.captureMessage('this is fine');
          Raven.captureMessage('this is fine'); // suppressed
          Raven.captureMessage('this is fine', {stacktrace: true});
          Raven.captureMessage("i'm okay with the events that are unfolding currently");
          Raven.captureMessage("that's okay, things are going to be okay");
        },
        function() {
          var breadcrumbs = iframe.contentWindow.Raven._breadcrumbs;

          assert.equal(breadcrumbs.length, 4);
          assert.equal(breadcrumbs[0].message, 'this is fine');
          assert.equal(breadcrumbs[1].message, 'this is fine'); // with stacktrace
          assert.equal(
            breadcrumbs[2].message,
            "i'm okay with the events that are unfolding currently"
          );
          assert.equal(
            breadcrumbs[3].message,
            "that's okay, things are going to be okay"
          );
        }
      );
    });
  });

  describe('window.onerror', function() {
    it('should catch syntax errors', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);
          eval('foo{};');
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          // ¯\_(ツ)_/¯
          if (isBelowIE11() || isEdge14()) {
            assert.equal(ravenData.exception.values[0].type, undefined);
          } else {
            assert.match(ravenData.exception.values[0].type, /SyntaxError/);
          }
          assert.equal(ravenData.exception.values[0].stacktrace.frames.length, 1); // just one frame
        }
      );
    });

    it('should catch thrown strings', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          // intentionally loading this error via a script file to make
          // sure it is 1) not caught by instrumentation 2) doesn't trigger
          // "Script error"
          var script = document.createElement('script');
          script.src = 'throw-string.js';
          script.onload = function() {
            done();
          };
          document.head.appendChild(script);
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.match(ravenData.exception.values[0].value, /stringError$/);
          assert.equal(ravenData.exception.values[0].stacktrace.frames.length, 1); // always 1 because thrown strings can't provide > 1 frame

          // some browsers extract proper url, line, and column for thrown strings
          // but not all - falls back to frame url
          assert.match(
            ravenData.exception.values[0].stacktrace.frames[0].filename,
            /\/test\/integration\//
          );
          assert.match(
            ravenData.exception.values[0].stacktrace.frames[0]['function'],
            /\?|global code/i
          );
        }
      );
    });

    it('should catch thrown objects', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          // intentionally loading this error via a script file to make
          // sure it is 1) not caught by instrumentation 2) doesn't trigger
          // "Script error"
          var script = document.createElement('script');
          script.src = 'throw-object.js';
          script.onload = function() {
            done();
          };
          document.head.appendChild(script);
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.equal(ravenData.exception.values[0].type, undefined);
          assert.equal(ravenData.exception.values[0].value, '[object Object]');
          assert.equal(ravenData.exception.values[0].stacktrace.frames.length, 1); // always 1 because thrown objects can't provide > 1 frame

          // some browsers extract proper url, line, and column for thrown objects
          // but not all - falls back to frame url
          assert.match(
            ravenData.exception.values[0].stacktrace.frames[0].filename,
            /\/test\/integration\//
          );
          assert.match(
            ravenData.exception.values[0].stacktrace.frames[0]['function'],
            /\?|global code/i
          );
        }
      );
    });

    it('should catch thrown errors', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          // intentionally loading this error via a script file to make
          // sure it is 1) not caught by instrumentation 2) doesn't trigger
          // "Script error"
          var script = document.createElement('script');
          script.src = 'throw-error.js';
          script.onload = function() {
            done();
          };
          document.head.appendChild(script);
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          // ¯\_(ツ)_/¯
          if (isBelowIE11() || isEdge14()) {
            assert.equal(ravenData.exception.values[0].type, undefined);
          } else {
            assert.match(ravenData.exception.values[0].type, /^Error/);
          }
          assert.match(ravenData.exception.values[0].value, /realError$/);
          // 1 or 2 depending on platform
          assert.isAtLeast(ravenData.exception.values[0].stacktrace.frames.length, 1);
          assert.isAtMost(ravenData.exception.values[0].stacktrace.frames.length, 2);
          assert.match(
            ravenData.exception.values[0].stacktrace.frames[0].filename,
            /\/test\/integration\/throw-error\.js/
          );
          assert.match(
            ravenData.exception.values[0].stacktrace.frames[0]['function'],
            /\?|global code|throwRealError/i
          );
        }
      );
    });

    it('should NOT catch an exception already caught via Raven.wrap', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);
          Raven.wrap(function() {
            foo();
          })();
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData;
          assert.equal(ravenData.length, 1); // one caught error
        }
      );
    });

    it('should catch an exception already caught [but rethrown] via Raven.captureException', function(
      done
    ) {
      // unlike Raven.wrap which ALWAYS re-throws, we don't know if the user will
      // re-throw an exception passed to Raven.captureException, and so we cannot
      // automatically suppress the next error caught through window.onerror
      var iframe = this.iframe;
      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);
          try {
            foo();
          } catch (e) {
            Raven.captureException(e);
            throw e; // intentionally re-throw
          }
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData;
          assert.equal(ravenData.length, 2);
        }
      );
    });
  });

  describe('wrapped built-ins', function() {
    it('should capture exceptions from event listeners', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          var div = document.createElement('div');
          document.body.appendChild(div);
          div.addEventListener(
            'click',
            function() {
              foo();
            },
            false
          );

          var click = new MouseEvent('click');
          div.dispatchEvent(click);
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.isAtLeast(ravenData.exception.values[0].stacktrace.frames.length, 3);
          assert.isAtMost(ravenData.exception.values[0].stacktrace.frames.length, 5);
        }
      );
    });

    it('should transparently remove event listeners from wrapped functions', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          var div = document.createElement('div');
          document.body.appendChild(div);
          var fooFn = function() {
            foo();
          };
          div.addEventListener('click', fooFn, false);
          div.removeEventListener('click', fooFn);

          var click = new MouseEvent('click');
          div.dispatchEvent(click);
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.equal(ravenData, null); // should never trigger error
        }
      );
    });

    it('should capture exceptions inside setTimeout', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(function() {
            setTimeout(done);
            foo();
          }, 10);
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.isAtLeast(ravenData.exception.values[0].stacktrace.frames.length, 3);
          assert.isAtMost(ravenData.exception.values[0].stacktrace.frames.length, 4);
        }
      );
    });

    it('should capture exceptions inside setInterval', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          var exceptionInterval = setInterval(function() {
            setTimeout(done);
            clearInterval(exceptionInterval);
            foo();
          }, 10);
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.isAtLeast(ravenData.exception.values[0].stacktrace.frames.length, 3);
          assert.isAtMost(ravenData.exception.values[0].stacktrace.frames.length, 4);
        }
      );
    });

    it('should capture exceptions inside requestAnimationFrame', function(done) {
      var iframe = this.iframe;
      // needs to be visible or requestAnimationFrame won't ever fire
      iframe.style.display = 'block';

      iframeExecute(
        iframe,
        done,
        function() {
          requestAnimationFrame(function() {
            setTimeout(done);
            foo();
          });
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          assert.isAtLeast(ravenData.exception.values[0].stacktrace.frames.length, 3);
          assert.isAtMost(ravenData.exception.values[0].stacktrace.frames.length, 4);
        }
      );
    });

    it('should capture exceptions from XMLHttpRequest event handlers (e.g. onreadystatechange)', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          var xhr = new XMLHttpRequest();

          // intentionally assign event handlers *after* XMLHttpRequest.prototype.open,
          // since this is what jQuery does
          // https://github.com/jquery/jquery/blob/master/src/ajax/xhr.js#L37

          xhr.open('GET', 'example.json');
          xhr.onreadystatechange = function() {
            setTimeout(done);
            // replace onreadystatechange with no-op so exception doesn't
            // fire more than once as XHR changes loading state
            xhr.onreadystatechange = function() {};
            foo();
          };
          xhr.send();
        },
        function() {
          var ravenData = iframe.contentWindow.ravenData[0];
          // # of frames alter significantly between chrome/firefox & safari
          assert.isAtLeast(ravenData.exception.values[0].stacktrace.frames.length, 3);
          assert.isAtMost(ravenData.exception.values[0].stacktrace.frames.length, 4);
        }
      );
    });
  });

  describe('breadcrumbs', function() {
    it('should record an XMLHttpRequest', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          var xhr = new XMLHttpRequest();

          xhr.open('GET', '/test/integration/example.json');
          xhr.setRequestHeader('Content-type', 'application/json');
          xhr.onreadystatechange = function() {
            // don't fire `done` handler until at least *one* onreadystatechange
            // has occurred (doesn't actually need to finish)
            if (xhr.readyState === 4) {
              setTimeout(done);
            }
          };
          xhr.send();
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          assert.equal(breadcrumbs.length, 1);
          assert.equal(breadcrumbs[0].type, 'http');
          assert.equal(breadcrumbs[0].data.method, 'GET');
        }
      );
    });

    it('should record an XMLHttpRequest without any handlers set', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          // I hate to do a time-based "done" trigger, but unfortunately we can't
          // set an onload/onreadystatechange handler on XHR to verify that it finished
          // - that's the whole point of this test! :(
          setTimeout(done, 1000);

          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          var xhr = new XMLHttpRequest();

          xhr.open('GET', '/test/integration/example.json');
          xhr.setRequestHeader('Content-type', 'application/json');
          xhr.send();
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          assert.equal(breadcrumbs.length, 1);

          assert.equal(breadcrumbs[0].type, 'http');
          assert.equal(breadcrumbs[0].category, 'xhr');
          assert.equal(breadcrumbs[0].data.method, 'GET');
        }
      );
    });

    it('should NOT denote XMLHttpRequests to the Sentry store endpoint as requiring breadcrumb capture', function(
      done
    ) {
      var iframe = this.iframe;
      iframeExecute(
        iframe,
        done,
        function() {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', 'http://example.com/api/1/store/?sentry_key=public');

          // can't actually transmit an XHR (breadcrumb isnt recorded until
          // onreadystatechange fires), so enough to just verify that
          // __raven_xhr wasn't set on xhr object

          window.ravenData = xhr.hasOwnProperty('__raven_xhr');
          setTimeout(done);
        },
        function() {
          assert.isFalse(iframe.contentWindow.ravenData);
        }
      );
    });

    it('should record a fetch request', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          fetch('/test/integration/example.json').then(
            function() {
              setTimeout(done);
            },
            function() {
              setTimeout(done);
            }
          );
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs,
            breadcrumbUrl = '/test/integration/example.json';

          if ('fetch' in window) {
            assert.equal(breadcrumbs.length, 1);

            assert.equal(breadcrumbs[0].type, 'http');
            assert.equal(breadcrumbs[0].category, 'fetch');
            assert.equal(breadcrumbs[0].data.method, 'GET');
            assert.equal(breadcrumbs[0].data.url, breadcrumbUrl);
          } else {
            // otherwise we use a fetch polyfill based on xhr
            assert.equal(breadcrumbs.length, 2);

            assert.equal(breadcrumbs[0].type, 'http');
            assert.equal(breadcrumbs[0].category, 'fetch');
            assert.equal(breadcrumbs[0].data.method, 'GET');
            assert.equal(breadcrumbs[0].data.url, breadcrumbUrl);

            assert.equal(breadcrumbs[1].type, 'http');
            assert.equal(breadcrumbs[1].category, 'xhr');
            assert.equal(breadcrumbs[1].data.method, 'GET');
            assert.equal(breadcrumbs[1].data.url, breadcrumbUrl);
          }
        }
      );
    });

    it('should record a fetch request with Request obj instead of URL string', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          fetch(new Request('/test/integration/example.json')).then(
            function() {
              setTimeout(done);
            },
            function() {
              setTimeout(done);
            }
          );
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs,
            breadcrumbUrl = '/test/integration/example.json';

          if ('fetch' in window) {
            assert.equal(breadcrumbs.length, 1);

            assert.equal(breadcrumbs[0].type, 'http');
            assert.equal(breadcrumbs[0].category, 'fetch');
            assert.equal(breadcrumbs[0].data.method, 'GET');
            // Request constructor normalizes the url
            assert.ok(breadcrumbs[0].data.url.indexOf(breadcrumbUrl) !== -1);
          } else {
            // otherwise we use a fetch polyfill based on xhr
            assert.equal(breadcrumbs.length, 2);

            assert.equal(breadcrumbs[0].type, 'http');
            assert.equal(breadcrumbs[0].category, 'fetch');
            assert.equal(breadcrumbs[0].data.method, 'GET');
            assert.ok(breadcrumbs[0].data.url.indexOf(breadcrumbUrl) !== -1);

            assert.equal(breadcrumbs[1].type, 'http');
            assert.equal(breadcrumbs[1].category, 'xhr');
            assert.equal(breadcrumbs[1].data.method, 'GET');
            assert.ok(breadcrumbs[1].data.url.indexOf(breadcrumbUrl) !== -1);
          }
        }
      );
    });

    it('should record a mouse click on element WITH click handler present', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          // add an event listener to the input. we want to make sure that
          // our breadcrumbs still work even if the page has an event listener
          // on an element that cancels event bubbling
          var input = document.getElementsByTagName('input')[0];
          var clickHandler = function(evt) {
            evt.stopPropagation(); // don't bubble
          };
          input.addEventListener('click', clickHandler);

          // click <input/>
          var click = new MouseEvent('click');
          input.dispatchEvent(click);
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          assert.equal(breadcrumbs.length, 1);

          assert.equal(breadcrumbs[0].category, 'ui.click');
          assert.equal(
            breadcrumbs[0].message,
            'body > form#foo-form > input[name="foo"]'
          );
        }
      );
    });

    it('should record a mouse click on element WITHOUT click handler present', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          // click <input/>
          var click = new MouseEvent('click');
          var input = document.getElementsByTagName('input')[0];
          input.dispatchEvent(click);
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          assert.equal(breadcrumbs.length, 1);

          assert.equal(breadcrumbs[0].category, 'ui.click');
          assert.equal(
            breadcrumbs[0].message,
            'body > form#foo-form > input[name="foo"]'
          );
        }
      );
    });

    it('should only record a SINGLE mouse click for a tree of elements with event listeners', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          var clickHandler = function(evt) {
            //evt.stopPropagation();
          };

          // mousemove event shouldnt clobber subsequent "breadcrumbed" events (see #724)
          document.querySelector('.a').addEventListener('mousemove', clickHandler);

          document.querySelector('.a').addEventListener('click', clickHandler);
          document.querySelector('.b').addEventListener('click', clickHandler);
          document.querySelector('.c').addEventListener('click', clickHandler);

          // click <input/>
          var click = new MouseEvent('click');
          var input = document.querySelector('.a'); // leaf node
          input.dispatchEvent(click);
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          assert.equal(breadcrumbs.length, 1);

          assert.equal(breadcrumbs[0].category, 'ui.click');
          assert.equal(breadcrumbs[0].message, 'body > div.c > div.b > div.a');
        }
      );
    });

    it('should bail out if accessing the `type` and `target` properties of an event throw an exception', function(
      done
    ) {
      // see: https://github.com/getsentry/raven-js/issues/768
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          // click <input/>
          var click = new MouseEvent('click');
          function kaboom() {
            throw new Error('lol');
          }
          Object.defineProperty(click, 'type', {get: kaboom});
          Object.defineProperty(click, 'target', {get: kaboom});

          var input = document.querySelector('.a'); // leaf node
          input.dispatchEvent(click);
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          assert.equal(breadcrumbs.length, 1);
          assert.equal(breadcrumbs[0].category, 'ui.click');
          assert.equal(breadcrumbs[0].message, '<unknown>');
        }
      );
    });

    it('should record consecutive keypress events into a single "input" breadcrumb', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          // keypress <input/> twice
          var keypress1 = new KeyboardEvent('keypress');
          var keypress2 = new KeyboardEvent('keypress');

          var input = document.getElementsByTagName('input')[0];
          input.dispatchEvent(keypress1);
          input.dispatchEvent(keypress2);
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          assert.equal(breadcrumbs.length, 1);

          assert.equal(breadcrumbs[0].category, 'ui.input');
          assert.equal(
            breadcrumbs[0].message,
            'body > form#foo-form > input[name="foo"]'
          );
        }
      );
    });

    it('should flush keypress breadcrumbs when an error is thrown', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          // keypress <input/>
          var keypress = new KeyboardEvent('keypress');

          var input = document.getElementsByTagName('input')[0];
          input.dispatchEvent(keypress);

          foo(); // throw exception
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          // 2 breadcrumbs: `ui_event`, then `error`
          assert.equal(breadcrumbs.length, 2);

          assert.equal(breadcrumbs[0].category, 'ui.input');
          assert.equal(
            breadcrumbs[0].message,
            'body > form#foo-form > input[name="foo"]'
          );
        }
      );
    });

    it('should flush keypress breadcrumb when input event occurs immediately after', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          // 1st keypress <input/>
          var keypress1 = new KeyboardEvent('keypress');
          // click <input/>
          var click = new MouseEvent('click');
          // 2nd keypress
          var keypress2 = new KeyboardEvent('keypress');

          var input = document.getElementsByTagName('input')[0];
          input.dispatchEvent(keypress1);
          input.dispatchEvent(click);
          input.dispatchEvent(keypress2);
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          // 2x `ui_event`
          assert.equal(breadcrumbs.length, 3);

          assert.equal(breadcrumbs[0].category, 'ui.input');
          assert.equal(
            breadcrumbs[0].message,
            'body > form#foo-form > input[name="foo"]'
          );

          assert.equal(breadcrumbs[1].category, 'ui.click');
          assert.equal(
            breadcrumbs[1].message,
            'body > form#foo-form > input[name="foo"]'
          );

          assert.equal(breadcrumbs[2].category, 'ui.input');
          assert.equal(
            breadcrumbs[2].message,
            'body > form#foo-form > input[name="foo"]'
          );
        }
      );
    });

    it('should record consecutive keypress events in a contenteditable into a single "input" breadcrumb', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          // keypress <input/> twice
          var keypress1 = new KeyboardEvent('keypress');
          var keypress2 = new KeyboardEvent('keypress');

          var div = document.querySelector('[contenteditable]');
          div.dispatchEvent(keypress1);
          div.dispatchEvent(keypress2);
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs;

          assert.equal(breadcrumbs.length, 1);

          assert.equal(breadcrumbs[0].category, 'ui.input');
          assert.equal(
            breadcrumbs[0].message,
            'body > form#foo-form > div.contenteditable'
          );
        }
      );
    });

    it('should record history.[pushState|back] changes as navigation breadcrumbs', function(
      done
    ) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          // some browsers trigger onpopstate for load / reset breadcrumb state
          Raven._breadcrumbs = [];

          history.pushState({}, '', '/foo');
          history.pushState({}, '', '/bar?a=1#fragment');
          history.pushState({}, '', {}); // pushState calls toString on non-string args
          history.pushState({}, '', null); // does nothing / no-op

          // can't call history.back() because it will change url of parent document
          // (e.g. document running mocha) ... instead just "emulate" a back button
          // press by calling replaceState + onpopstate manually
          history.replaceState({}, '', '/bar?a=1#fragment');
          window.onpopstate();
          done();
        },
        function() {
          var Raven = iframe.contentWindow.Raven,
            breadcrumbs = Raven._breadcrumbs,
            from,
            to;

          assert.equal(breadcrumbs.length, 4);
          assert.equal(breadcrumbs[0].category, 'navigation'); // (start) => foo
          assert.equal(breadcrumbs[1].category, 'navigation'); // foo => bar?a=1#fragment
          assert.equal(breadcrumbs[2].category, 'navigation'); // bar?a=1#fragment => [object%20Object]
          assert.equal(breadcrumbs[3].category, 'navigation'); // [object%20Object] => bar?a=1#fragment (back button)

          assert.ok(
            /\/test\/integration\/frame\.html$/.test(Raven._breadcrumbs[0].data.from),
            "'from' url is incorrect"
          );
          assert.ok(/\/foo$/.test(breadcrumbs[0].data.to), "'to' url is incorrect");

          assert.ok(/\/foo$/.test(breadcrumbs[1].data.from), "'from' url is incorrect");
          assert.ok(
            /\/bar\?a=1#fragment$/.test(breadcrumbs[1].data.to),
            "'to' url is incorrect"
          );

          assert.ok(
            /\/bar\?a=1#fragment$/.test(breadcrumbs[2].data.from),
            "'from' url is incorrect"
          );
          assert.ok(
            /\[object Object\]$/.test(breadcrumbs[2].data.to),
            "'to' url is incorrect"
          );

          assert.ok(
            /\[object Object\]$/.test(breadcrumbs[3].data.from),
            "'from' url is incorrect"
          );
          assert.ok(
            /\/bar\?a=1#fragment/.test(breadcrumbs[3].data.to),
            "'to' url is incorrect"
          );
        }
      );
    });
  });

  describe('uninstall', function() {
    it('should restore original built-ins', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);
          Raven.uninstall();

          window.isRestored = {
            setTimeout: originalBuiltIns.setTimeout === setTimeout,
            setInterval: originalBuiltIns.setInterval === setInterval,
            requestAnimationFrame:
              originalBuiltIns.requestAnimationFrame === requestAnimationFrame,
            xhrProtoOpen: originalBuiltIns.xhrProtoOpen === XMLHttpRequest.prototype.open,
            headAddEventListener:
              originalBuiltIns.headAddEventListener === document.body.addEventListener,
            headRemoveEventListener:
              originalBuiltIns.headRemoveEventListener ===
              document.body.removeEventListener
          };
        },
        function() {
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

    it('should not restore XMLHttpRequest instance methods', function(done) {
      var iframe = this.iframe;

      iframeExecute(
        iframe,
        done,
        function() {
          setTimeout(done);

          var xhr = new XMLHttpRequest();
          var origOnReadyStateChange = (xhr.onreadystatechange = function() {});
          xhr.open('GET', '/foo/');
          xhr.abort();

          Raven.uninstall();

          window.isOnReadyStateChangeRestored = xhr.onready === origOnReadyStateChange;
        },
        function() {
          assert.isFalse(iframe.contentWindow.isOnReadyStateChangeRestored);
        }
      );
    });
  });
});
