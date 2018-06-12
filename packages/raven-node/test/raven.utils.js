/* eslint max-len:0, no-undefined:0 */
'use strict';

var versionRegexp = /^v(\d+)\.(\d+)\.(\d+)$/i;
var majorVersion = parseInt(versionRegexp.exec(process.version)[1], 10);

var raven = require('../');

var _oldConsoleWarn = console.warn;

function mockConsoleWarn() {
  console.warn = function() {
    console.warn._called = true;
    ++console.warn._callCount;
  };
  console.warn._called = false;
  console.warn._callCount = 0;
}

function restoreConsoleWarn() {
  console.warn = _oldConsoleWarn;
}

describe('raven.utils', function() {
  describe('#parseDSN()', function() {
    it('should parse hosted Sentry DSN without path', function() {
      var dsn = raven.utils.parseDSN(
        'https://8769c40cf49c4cc58b51fa45d8e2d166:296768aa91084e17b5ac02d3ad5bc7e7@app.getsentry.com/269'
      );
      var expected = {
        protocol: 'https',
        public_key: '8769c40cf49c4cc58b51fa45d8e2d166',
        private_key: '296768aa91084e17b5ac02d3ad5bc7e7',
        host: 'app.getsentry.com',
        path: '/',
        project_id: '269',
        port: 443
      };
      dsn.should.eql(expected);
    });

    it('should parse http not on hosted Sentry with path', function() {
      var dsn = raven.utils.parseDSN(
        'http://8769c40cf49c4cc58b51fa45d8e2d166:296768aa91084e17b5ac02d3ad5bc7e7@mysentry.com/some/other/path/269'
      );
      var expected = {
        protocol: 'http',
        public_key: '8769c40cf49c4cc58b51fa45d8e2d166',
        private_key: '296768aa91084e17b5ac02d3ad5bc7e7',
        host: 'mysentry.com',
        path: '/some/other/path/',
        project_id: '269',
        port: 80
      };
      dsn.should.eql(expected);
    });

    it('should parse DSN with non-standard port', function() {
      var dsn = raven.utils.parseDSN(
        'https://8769c40cf49c4cc58b51fa45d8e2d166:296768aa91084e17b5ac02d3ad5bc7e7@mysentry.com:8443/some/other/path/269'
      );
      var expected = {
        protocol: 'https',
        public_key: '8769c40cf49c4cc58b51fa45d8e2d166',
        private_key: '296768aa91084e17b5ac02d3ad5bc7e7',
        host: 'mysentry.com',
        path: '/some/other/path/',
        project_id: '269',
        port: 8443
      };
      dsn.should.eql(expected);
    });

    it('should return false for a falsey dns', function() {
      raven.utils.parseDSN(false).should.eql(false);
      raven.utils.parseDSN('').should.eql(false);
    });

    it('show throw an Error on invalid transport protocol', function() {
      (function() {
        raven.utils.parseDSN(
          'noop://8769c40cf49c4cc58b51fa45d8e2d166:296768aa91084e17b5ac02d3ad5bc7e7@mysentry.com:1234/some/other/path/269'
        );
      }.should.throw());
    });

    it('should ignore a sub-transport protocol', function() {
      var dsn = raven.utils.parseDSN(
        'gevent+https://8769c40cf49c4cc58b51fa45d8e2d166:296768aa91084e17b5ac02d3ad5bc7e7@mysentry.com:8443/some/other/path/269'
      );
      var expected = {
        protocol: 'https',
        public_key: '8769c40cf49c4cc58b51fa45d8e2d166',
        private_key: '296768aa91084e17b5ac02d3ad5bc7e7',
        host: 'mysentry.com',
        path: '/some/other/path/',
        project_id: '269',
        port: 8443
      };
      dsn.should.eql(expected);
    });

    it('should parse DSN without private key', function() {
      var dsn = raven.utils.parseDSN(
        'https://8769c40cf49c4cc58b51fa45d8e2d166@mysentry.com:8443/some/other/path/269'
      );
      var expected = {
        protocol: 'https',
        public_key: '8769c40cf49c4cc58b51fa45d8e2d166',
        host: 'mysentry.com',
        path: '/some/other/path/',
        project_id: '269',
        port: 8443
      };
      dsn.should.eql(expected);
    });
  });

  describe('#parseAuthHeader()', function() {
    it('should parse all parameters', function() {
      var timestamp = 12345,
        apiKey = 'abc',
        apiSecret = 'xyz';
      var expected =
        'Sentry sentry_version=5, sentry_timestamp=12345, sentry_client=raven-node/' +
        raven.version +
        ', sentry_key=abc, sentry_secret=xyz';
      raven.utils.getAuthHeader(timestamp, apiKey, apiSecret).should.equal(expected);
    });

    it('should skip sentry_secret if apiSecret not provided', function() {
      var timestamp = 12345,
        apiKey = 'abc';
      var expected =
        'Sentry sentry_version=5, sentry_timestamp=12345, sentry_client=raven-node/' +
        raven.version +
        ', sentry_key=abc';
      raven.utils.getAuthHeader(timestamp, apiKey).should.equal(expected);
    });
  });

  describe('#parseStack()', function() {
    // needs new tests with a mock callsite object
    it('shouldnt barf on an invalid stack', function() {
      var parseStack = raven.utils.parseStack;
      var callback = function(frames) {
        frames.length.should.equal(0);
      };
      parseStack('lol', callback);
      parseStack(void 0, callback);
      parseStack([], callback);
      parseStack(
        [
          {
            lol: 1
          }
        ],
        callback
      );
    });

    it('should extract context from last stack line', function(done) {
      var parseStack = raven.utils.parseStack;
      var callback = function(frames) {
        var frame = frames.pop();

        /* verify that the frame has the properties: pre_context, context_line
        and post_context, which are valid for in-app stack lines only.*/
        frame.pre_context.should.be.an.instanceOf(Array);
        frame.context_line.should.be.type('string');
        frame.context_line.trim().should.endWith('undeclared_function();');
        frame.post_context.should.be.an.instanceOf(Array);

        frame.in_app.should.be.true;
        done();
      };
      try {
        // eslint-disable-next-line no-undef
        undeclared_function();
      } catch (e) {
        parseStack(e, callback);
      }
    });

    it('should trim long source line in surrounding source context', function(done) {
      var parseStack = raven.utils.parseStack;
      var callback = function(frames) {
        var frame = frames.pop();
        frame.in_app.should.be.true;

        var lineBefore = frame.pre_context[frame.pre_context.length - 1].trim();
        lineBefore.should.not.startWith('{snip}');
        lineBefore.should.endWith('{snip}');

        var lineOf = frame.context_line.trim();
        lineOf.should.startWith('{snip}');
        lineOf.should.endWith('{snip}');
        lineOf.length.should.equal(154); // 140 limit + 7 for `{snip} ` and ` {snip}`
        lineOf.should.containEql("throw new Error('boom');");

        var lineAfter = frame.post_context[0].trim();
        lineAfter.should.not.startWith('{snip}');
        lineAfter.should.endWith('{snip}');
        done();
      };
      try {
        require('./fixtures/long-line')();
      } catch (e) {
        parseStack(e, callback);
      }
    });

    it('should treat windows files as being in app: in_app should be true', function(done) {
      var parseStack = raven.utils.parseStack;
      var callback = function(frames) {
        var frame = frames.pop();
        frame.filename.should.be.type('string');
        frame.filename.should.startWith('C:\\');
        frame.in_app.should.be.true;
        done();
      };
      var err = new Error('some error message');
      // get first line of err stack (line after err message)
      var firstFileLine = err.stack.split('\n')[1];
      // replace first occurrence of "/" with C:\ to mock windows style
      var winFirstFileLine = firstFileLine.replace(/[/]/, 'C:\\');
      // replace all remaining "/" with "\"
      winFirstFileLine = winFirstFileLine.replace(/[/]/g, '\\');
      // create a "win-style" stack replacing the first err.stack line with our above win-style line
      err.stack = err.stack.replace(firstFileLine, winFirstFileLine);
      parseStack(err, callback);
    });

    it('should mark node core library frames as not being in app', function(done) {
      var qsStringify = require('querystring').stringify;
      var parseStack = raven.utils.parseStack;

      var callback = function(frames) {
        var frame1 = frames.pop();
        frame1.in_app.should.be.false;
        frame1.filename.should.equal('querystring.js');

        var frame2 = frames.pop();
        frame2.in_app.should.be.false;
        frame2.filename.should.equal('querystring.js');

        done();
      };

      try {
        // Incomplete surrogate pair will cause qs.encode (used by qs.stringify) to throw
        qsStringify({a: '\uDCA9'});
      } catch (e) {
        parseStack(e, callback);
      }
    });

    it('should not read the same source file multiple times when getting source context lines', function(done) {
      var fs = require('fs');
      var origReadFile = fs.readFile;
      var filesRead = [];

      fs.readFile = function(file) {
        filesRead.push(file);
        origReadFile.apply(this, arguments);
      };

      function parseCallback(frames) {
        // first two frames will both be from this file, but we should have only read this file once
        var frame1 = frames.pop();
        var frame2 = frames.pop();
        frame1.context_line.trim().should.endWith("throw new Error('error');");
        frame2.context_line.trim().should.endWith('nestedThrow();');
        frame1.filename.should.equal(frame2.filename);

        var uniqueFilesRead = filesRead.filter(function(filename, idx, arr) {
          return arr.indexOf(filename) === idx;
        });
        filesRead.length.should.equal(uniqueFilesRead.length);

        fs.readFile = origReadFile;
        done();
      }

      function nestedThrow() {
        throw new Error('error');
      }

      try {
        nestedThrow();
      } catch (e) {
        raven.utils.parseStack(e, parseCallback);
      }
    });

    it('should handle spaces in paths', function(done) {
      var parseStack = raven.utils.parseStack;
      var callback = function(frames) {
        var frame = frames.pop();
        frame.module.should.endWith('file with spaces in path');
        frame.filename.should.endWith('file with spaces in path.js');
        done();
      };
      try {
        require('./fixtures/file with spaces in path')();
      } catch (e) {
        parseStack(e, callback);
      }
    });
  });

  describe('#getTransaction()', function() {
    it('should handle empty', function() {
      raven.utils.getTransaction({}).should.eql('<unknown>');
    });

    it('should handle missing module', function() {
      raven.utils
        .getTransaction({
          function: 'foo'
        })
        .should.eql('? at foo');
    });

    it('should handle missing function', function() {
      raven.utils
        .getTransaction({
          module: 'foo'
        })
        .should.eql('foo at ?');
    });

    it('should work', function() {
      raven.utils
        .getTransaction({
          module: 'foo',
          function: 'bar'
        })
        .should.eql('foo at bar');
    });
  });

  describe('#getModule()', function() {
    it('should identify a node_module', function() {
      var filename = '/home/x/node_modules/foo/bar/baz.js';
      raven.utils.getModule(filename).should.eql('foo.bar:baz');
    });

    it('should identify a main module', function() {
      var filename = '/home/x/foo/bar/baz.js';
      raven.utils.getModule(filename, '/home/x/').should.eql('foo.bar:baz');
    });

    it('should fallback to just filename', function() {
      var filename = '/home/lol.js';
      raven.utils.getModule(filename).should.eql('lol');
    });
  });

  describe('#serializeException()', function() {
    it('return [Object] when reached depth=0', function() {
      var actual = raven.utils.serializeException(
        {
          a: 42,
          b: 'asd',
          c: true
        },
        0
      );
      var expected = '[Object]';

      actual.should.eql(expected);
    });

    it('should serialize one level deep with depth=1', function() {
      var actual = raven.utils.serializeException(
        {
          a: 42,
          b: 'asd',
          c: true,
          d: undefined,
          e:
            'very long string that is definitely over 120 characters, which is default for now but can be changed anytime because why not?',
          f: {foo: 42},
          g: [1, 'a', true],
          h: function() {}
        },
        1
      );
      var expected = {
        a: 42,
        b: 'asd',
        c: true,
        d: undefined,
        e: 'very long string that is definitely ove\u2026',
        f: '[Object]',
        g: '[Array]',
        // Node < 6 is not capable of pulling function name from unnamed object methods
        h: majorVersion < 6 ? '[Function]' : '[Function: h]'
      };

      actual.should.eql(expected);
    });

    it('should serialize arbitrary number of depths', function() {
      var actual = raven.utils.serializeException(
        {
          a: 42,
          b: 'asd',
          c: true,
          d: undefined,
          e:
            'very long string that is definitely over 40 characters, which is default for now but can be changed',
          f: {
            foo: 42,
            bar: {
              foo: 42,
              bar: {
                bar: {
                  bar: {
                    bar: 42
                  }
                }
              },
              baz: ['hello']
            },
            baz: [1, 'a', true]
          },
          g: [1, 'a', true],
          h: function bar() {}
        },
        5
      );
      var expected = {
        a: 42,
        b: 'asd',
        c: true,
        d: undefined,
        e: 'very long string that is definitely ove\u2026',
        f: {
          foo: 42,
          bar: {
            foo: 42,
            bar: {
              bar: {
                bar: '[Object]'
              }
            },
            baz: ['hello']
          },
          baz: [1, 'a', true]
        },
        g: [1, 'a', true],
        h: '[Function: bar]'
      };

      actual.should.eql(expected);
    });

    it('should reduce depth if payload size was exceeded', function() {
      var actual = raven.utils.serializeException(
        {
          a: {
            a: '50kB worth of payload pickle rick',
            b: '50kB worth of payload pickle rick'
          },
          b: '50kB worth of payload pickle rick'
        },
        2,
        100
      );
      var expected = {
        a: '[Object]',
        b: '50kB worth of payload pickle rick'
      };

      actual.should.eql(expected);
    });

    it('should reduce depth only one level at the time', function() {
      var actual = raven.utils.serializeException(
        {
          a: {
            a: {
              a: {
                a: [
                  '50kB worth of payload pickle rick',
                  '50kB worth of payload pickle rick',
                  '50kB worth of payload pickle rick'
                ]
              }
            },
            b: '50kB worth of payload pickle rick'
          },
          b: '50kB worth of payload pickle rick'
        },
        4,
        200
      );
      var expected = {
        a: {
          a: {
            a: {
              a: '[Array]'
            }
          },
          b: '50kB worth of payload pickle rick'
        },
        b: '50kB worth of payload pickle rick'
      };

      actual.should.eql(expected);
    });

    it('should fallback to [Object] if cannot reduce payload size enough', function() {
      var actual = raven.utils.serializeException(
        {
          a: '50kB worth of payload pickle rick',
          b: '50kB worth of payload pickle rick',
          c: '50kB worth of payload pickle rick',
          d: '50kB worth of payload pickle rick'
        },
        1,
        100
      );
      var expected = '[Object]';

      actual.should.eql(expected);
    });
  });

  describe('#serializeKeysForMessage()', function() {
    it('should fit as many keys as possible in default limit of 40', function() {
      var actual = raven.utils.serializeKeysForMessage([
        'pickle',
        'rick',
        'morty',
        'snuffles',
        'server',
        'request'
      ]);
      var expected = 'pickle, rick, morty, snuffles, server\u2026';
      actual.should.eql(expected);
    });

    it('shouldnt append ellipsis if have enough space', function() {
      var actual = raven.utils.serializeKeysForMessage(['pickle', 'rick', 'morty']);
      var expected = 'pickle, rick, morty';
      actual.should.eql(expected);
    });

    it('should default to no-keys message if empty array provided', function() {
      var actual = raven.utils.serializeKeysForMessage([]);
      var expected = '[object has no keys]';
      actual.should.eql(expected);
    });

    it('should leave first key as is, if its too long for the limit', function() {
      var actual = raven.utils.serializeKeysForMessage([
        'imSuchALongKeyThatIDontEvenFitInTheLimitOf40Characters',
        'pickle'
      ]);
      var expected = 'imSuchALongKeyThatIDontEvenFitInTheLimitOf40Characters';
      actual.should.eql(expected);
    });

    it('should with with provided maxLength', function() {
      var actual = raven.utils.serializeKeysForMessage(['foo', 'bar', 'baz'], 10);
      var expected = 'foo, bar\u2026';
      actual.should.eql(expected);
    });

    it('handles incorrect input', function() {
      raven.utils.serializeKeysForMessage({}).should.eql('');
      raven.utils.serializeKeysForMessage(false).should.eql('');
      raven.utils.serializeKeysForMessage(undefined).should.eql('');
      raven.utils.serializeKeysForMessage(42).should.eql('42');
      raven.utils.serializeKeysForMessage('foo').should.eql('foo');
    });
  });

  describe('isError', function() {
    it('should work as advertised', function() {
      function RavenError(message) {
        this.name = 'RavenError';
        this.message = message;
      }
      RavenError.prototype = new Error();
      RavenError.prototype.constructor = RavenError;

      raven.utils.isError(new Error()).should.be.true;
      raven.utils.isError(new RavenError()).should.be.true;
      raven.utils.isError({}).should.be.false;
      raven.utils.isError({
        message: 'A fake error',
        stack: 'no stack here'
      }).should.be.false;
      raven.utils.isError('').should.be.false;
      raven.utils.isError(true).should.be.false;
    });

    it('should work with errors from different contexts, eg. vm module', function(done) {
      var vm = require('vm');
      var script = new vm.Script("throw new Error('this is the error')");

      try {
        script.runInNewContext();
      } catch (e) {
        raven.utils.isError(e).should.be.true;
        done();
      }
    });
  });

  describe('#consoleAlert()', function() {
    it('should call console.warn if enabled', function() {
      mockConsoleWarn();
      raven.utils.consoleAlert('foo');
      raven.utils.consoleAlert('foo');
      console.warn._called.should.eql(true);
      console.warn._callCount.should.eql(2);
      restoreConsoleWarn();
    });

    it('should be disabled after calling disableConsoleAlerts', function() {
      mockConsoleWarn();
      raven.utils.disableConsoleAlerts();
      raven.utils.consoleAlert('foo');
      console.warn._called.should.eql(false);
      console.warn._callCount.should.eql(0);
      raven.utils.enableConsoleAlerts();
      restoreConsoleWarn();
    });

    it('should be disabled after calling disableConsoleAlerts, even after previous successful calls', function() {
      mockConsoleWarn();
      raven.utils.consoleAlert('foo');
      console.warn._called.should.eql(true);
      console.warn._callCount.should.eql(1);
      raven.utils.disableConsoleAlerts();
      raven.utils.consoleAlert('foo');
      console.warn._callCount.should.eql(1);
      raven.utils.enableConsoleAlerts();
      restoreConsoleWarn();
    });
  });

  describe('#consoleAlertOnce()', function() {
    it('should call console.warn if enabled, but only once with the same message', function() {
      mockConsoleWarn();
      raven.utils.consoleAlertOnce('foo');
      console.warn._called.should.eql(true);
      console.warn._callCount.should.eql(1);
      raven.utils.consoleAlertOnce('foo');
      console.warn._callCount.should.eql(1);
      restoreConsoleWarn();
    });

    it('should be disable after calling disableConsoleAlerts', function() {
      mockConsoleWarn();
      raven.utils.disableConsoleAlerts();
      raven.utils.consoleAlertOnce('foo');
      console.warn._called.should.eql(false);
      console.warn._callCount.should.eql(0);
      raven.utils.enableConsoleAlerts();
      restoreConsoleWarn();
    });
  });
});
