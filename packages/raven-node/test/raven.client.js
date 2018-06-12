/* eslint no-shadow:0, consistent-return:0, no-console:0 */
/* global Promise */
'use strict';

var versionRegexp = /^v(\d+)\.(\d+)\.(\d+)$/i;
var majorVersion = parseInt(versionRegexp.exec(process.version)[1], 10);

var raven = require('../'),
  nock = require('nock'),
  url = require('url'),
  zlib = require('zlib'),
  child_process = require('child_process');

var dsn = 'https://public:private@app.getsentry.com/269';

var _oldConsoleWarn = console.warn;

function mockConsoleWarn() {
  console.warn = function() {
    console.warn._called = true;
  };
  console.warn._called = false;
}

function restoreConsoleWarn() {
  console.warn = _oldConsoleWarn;
}

describe('raven.version', function() {
  it('should be valid', function() {
    raven.version.should.match(/^\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/);
  });

  it('should match package.json', function() {
    var version = require('../package.json').version;
    raven.version.should.equal(version);
  });
});

describe('raven.Client', function() {
  var client;
  beforeEach(function() {
    raven.utils.disableConsoleAlerts();
    client = new raven.Client(dsn);
  });

  afterEach(function() {
    raven.utils.enableConsoleAlerts();
    client = new raven.Client(dsn);
  });

  it('should parse the DSN with options', function() {
    var expected = {
      protocol: 'https',
      public_key: 'public',
      private_key: 'private',
      host: 'app.getsentry.com',
      path: '/',
      project_id: '269',
      port: 443
    };
    var client = new raven.Client(dsn, {
      name: 'YAY!'
    });
    client.dsn.should.eql(expected);
    client.name.should.equal('YAY!');
  });

  it('should pull SENTRY_DSN from environment', function() {
    var expected = {
      protocol: 'https',
      public_key: 'abc',
      private_key: '123',
      host: 'app.getsentry.com',
      path: '/',
      project_id: '1',
      port: 443
    };
    process.env.SENTRY_DSN = 'https://abc:123@app.getsentry.com/1';
    var client = new raven.Client();
    client.dsn.should.eql(expected);
    delete process.env.SENTRY_DSN; // gotta clean up so it doesn't leak into other tests
  });

  it('should pull SENTRY_DSN from environment when passing options', function() {
    var expected = {
      protocol: 'https',
      public_key: 'abc',
      private_key: '123',
      host: 'app.getsentry.com',
      path: '/',
      project_id: '1',
      port: 443
    };
    process.env.SENTRY_DSN = 'https://abc:123@app.getsentry.com/1';
    var client = new raven.Client({
      name: 'YAY!'
    });
    client.dsn.should.eql(expected);
    client.name.should.equal('YAY!');
    delete process.env.SENTRY_DSN; // gotta clean up so it doesn't leak into other tests
  });

  it('should be disabled when no DSN specified', function() {
    mockConsoleWarn();
    var client = new raven.Client();
    client._enabled.should.eql(false);
    console.warn._called.should.eql(false);
    restoreConsoleWarn();
  });

  it('should pull SENTRY_NAME from environment', function() {
    process.env.SENTRY_NAME = 'new_name';
    var client = new raven.Client(dsn);
    client.name.should.eql('new_name');
    delete process.env.SENTRY_NAME;
  });

  it('should be disabled for a falsey DSN', function() {
    mockConsoleWarn();
    var client = new raven.Client(false);
    client._enabled.should.eql(false);
    console.warn._called.should.eql(false);
    restoreConsoleWarn();
  });

  it('should pull release from options if present', function() {
    var client = new raven.Client(dsn, {
      release: 'version1'
    });
    client.release.should.eql('version1');
  });

  it('should pull SENTRY_RELEASE from environment', function() {
    process.env.SENTRY_RELEASE = 'version1';
    var client = new raven.Client(dsn);
    client.release.should.eql('version1');
    delete process.env.SENTRY_RELEASE;
  });

  it('should pull environment from options if present', function() {
    var client = new raven.Client(dsn, {
      environment: 'staging'
    });
    client.environment.should.eql('staging');
  });

  it('should pull SENTRY_ENVIRONMENT from environment', function() {
    process.env.SENTRY_ENVIRONMENT = 'staging';
    var client = new raven.Client(dsn);
    client.environment.should.eql('staging');
    delete process.env.SENTRY_ENVIRONMENT;
  });

  describe('#captureMessage()', function() {
    it('should send a plain text message to Sentry server', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, 'OK');

      client.on('logged', function() {
        scope.done();
        done();
      });
      client.captureMessage('Hey!');
    });

    it('should emit error when request returns non 200', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(500, 'Oops!');

      client.on('error', function() {
        scope.done();
        done();
      });
      client.captureMessage('Hey!');
    });

    it("shouldn't shit it's pants when error is emitted without a listener", function() {
      nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(500, 'Oops!');

      client.captureMessage('Hey!');
    });

    it('should attach an Error object when emitting error', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(500, 'Oops!', {
          'x-sentry-error': 'Oops!'
        });

      client.on('error', function(e) {
        e.statusCode.should.eql(500);
        e.reason.should.eql('Oops!');
        e.response.should.be.ok;
        scope.done();
        done();
      });

      client.captureMessage('Hey!');
    });

    it('should allow for attaching stacktrace', function(done) {
      var dsn = 'https://public:private@app.getsentry.com:8443/269';
      var client = new raven.Client(dsn, {
        stacktrace: true
      });
      client.send = function mockSend(kwargs) {
        kwargs.message.should.equal('wtf?');
        kwargs.should.have.property('stacktrace');
        var stack = kwargs.stacktrace;
        stack.frames[stack.frames.length - 1].context_line.should.match(/captureMessage/);
        done();
      };
      client.captureMessage('wtf?');
    });

    it('should call callback even without a config', function(done) {
      raven.captureMessage('wtf?', function(err) {
        done();
      });
    });
  });

  describe('#captureException()', function() {
    it('should send an Error to Sentry server', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, 'OK');

      client.on('logged', function() {
        scope.done();
        done();
      });
      client.captureException(new Error('wtf?'));
    });

    it('should send a plain text "error" with a synthesized stack', function(done) {
      var old = client.send;
      client.send = function mockSend(kwargs) {
        client.send = old;

        kwargs.message.should.equal('Error: wtf?');
        kwargs.should.have.property('exception');
        var stack = kwargs.exception[0].stacktrace;
        stack.frames[stack.frames.length - 1].function.should.equal(
          'Raven.captureException'
        );
        done();
      };
      client.captureException('wtf?');
    });

    it('should serialize non-error exceptions', function(done) {
      var old = client.send;
      client.send = function mockSend(kwargs) {
        client.send = old;
        kwargs.message.should.equal(
          'Non-Error exception captured with keys: aKeyOne, bKeyTwo, cKeyThree, dKeyFour\u2026'
        );
        kwargs.extra.should.have.property('__serialized__', {
          aKeyOne: 'a',
          bKeyTwo: 42,
          cKeyThree: {},
          dKeyFour: ['d'],
          eKeyFive: '[Function: foo]',
          fKeySix: {
            levelTwo: {
              levelThreeObject: '[Object]',
              levelThreeArray: '[Array]',
              // Node < 6 is not capable of pulling function name from unnamed object methods
              levelThreeAnonymousFunction:
                majorVersion < 6
                  ? '[Function]'
                  : '[Function: levelThreeAnonymousFunction]',
              levelThreeNamedFunction: '[Function: bar]',
              levelThreeString: 'foo',
              levelThreeNumber: 42
            }
          }
        });

        done();
      };
      client.captureException({
        aKeyOne: 'a',
        bKeyTwo: 42,
        cKeyThree: {},
        dKeyFour: ['d'],
        eKeyFive: function foo() {},
        fKeySix: {
          levelTwo: {
            levelThreeObject: {
              enough: 42
            },
            levelThreeArray: [42],
            levelThreeAnonymousFunction: function() {},
            levelThreeNamedFunction: function bar() {},
            levelThreeString: 'foo',
            levelThreeNumber: 42
          }
        }
      });
    });

    it('should send an Error to Sentry server on another port', function(done) {
      var scope = nock('https://app.getsentry.com:8443')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, 'OK');

      var dsn = 'https://public:private@app.getsentry.com:8443/269';
      var client = new raven.Client(dsn);
      client.on('logged', function() {
        scope.done();
        done();
      });
      client.captureException(new Error('wtf?'));
    });

    it("shouldn't choke on circular references", function(done) {
      // See: https://github.com/mattrobenolt/raven-node/pull/46
      var old = zlib.deflate;
      zlib.deflate = function mockSend(skwargs) {
        zlib.deflate = old;
        var kwargs = JSON.parse(skwargs);
        kwargs.extra.should.have.property('foo', {
          foo: '[Circular ~.extra.foo]'
        });
        done();
      };

      // create circular reference
      var kwargs = {
        extra: {
          foo: null
        }
      };
      kwargs.extra.foo = kwargs.extra;
      client.captureException(new Error('wtf?'), kwargs);
    });

    it("shouldn't attach `req` kwargs to the outbound payload", function(done) {
      var scope = nock('https://app.getsentry.com:8443')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, function(uri, body) {
          zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
            if (err) return done(err);
            var msg = JSON.parse(dec.toString());

            msg.should.not.have.property('req');
            msg.should.have.property('request');
            done();
          });
          return 'OK';
        });

      var dsn = 'https://public:private@app.getsentry.com:8443/269';
      var client = new raven.Client(dsn);
      client.on('logged', function() {
        scope.done();
      });
      client.captureException(new Error('wtf?'), {
        req: {
          method: 'GET',
          originalUrl: 'http://example.com/'
        }
      });
    });

    it('should call callback even without a config', function(done) {
      raven.captureException(new Error('wtf?'), function(err) {
        done();
      });
    });

    it('should use and merge provided extra data instead of overriding it', function(done) {
      var old = client.send;
      client.send = function mockSend(kwargs) {
        client.send = old;
        kwargs.extra.should.have.property('hello', 'there');
        kwargs.tags.should.deepEqual({'0': 'whoop'});
        done();
      };
      client.captureException(
        {some: 'exception'},
        {
          extra: {
            hello: 'there'
          },
          tags: ['whoop']
        }
      );
    });
  });

  describe('#install()', function() {
    beforeEach(function() {
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('unhandledRejection');
    });

    afterEach(function() {
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('unhandledRejection');
    });

    it('should not listen for unhandledRejection unless told to', function() {
      var listeners = process.listeners('unhandledRejection');
      listeners.length.should.equal(0);

      client.install();

      listeners = process.listeners('unhandledRejection');
      listeners.length.should.equal(0);
    });

    it('should catch an unhandledRejection', function(done) {
      var listeners = process.listeners('unhandledRejection');
      listeners.length.should.equal(0);

      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, 'OK');

      client = new raven.Client(dsn, {captureUnhandledRejections: true});
      client.install();

      client.on('logged', function() {
        scope.done();
        done();
      });

      listeners = process.listeners('unhandledRejection');
      listeners.length.should.equal(1);

      // promises didn't fire unhandledRejection until 1.4.1
      if (process.version >= 'v1.4.1') {
        // eslint-disable-next-line no-new
        new Promise(function(resolve, reject) {
          reject(new Error('rejected!'));
        });
      } else {
        process.emit('unhandledRejection', new Error('rejected!'));
      }
    });

    it('should preserve context on unhandledRejection', function(done) {
      var listeners = process.listeners('unhandledRejection');
      listeners.length.should.equal(0);

      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, function(uri, body) {
          zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
            if (err) return done(err);
            var msg = JSON.parse(dec.toString());

            msg.user.should.eql({
              id: '123'
            });

            scope.done();
            done();
          });
          return 'OK';
        });

      client = new raven.Client(dsn, {captureUnhandledRejections: true});
      client.install();

      listeners = process.listeners('unhandledRejection');
      listeners.length.should.equal(1);

      client.context(function() {
        client.setContext({
          user: {
            id: '123'
          }
        });

        // promises didn't include domain property until 8.0.0
        // see: https://nodejs.org/api/domain.html#domain_domains_and_promises
        // also: https://github.com/nodejs/node/pull/12489
        if (process.version >= 'v8.0.0') {
          // eslint-disable-next-line no-new
          new Promise(function(resolve, reject) {
            reject(new Error('rejected!'));
          });
        } else {
          setTimeout(function() {
            var error = new Error('rejected!');
            var promise = Promise.reject(error);
            process.emit('unhandledRejection', error, promise);
          });
        }
      });
    });

    it('should add itself to the uncaughtException event list', function() {
      var listeners = process.listeners('uncaughtException');
      listeners.length.should.equal(0);

      client.install();

      // Since Node v9, any listener will be prepended with domain specific listener and it cannot be altered
      // https://github.com/nodejs/node/blob/ca41a30afa825373f2711a46965dfd4ca4a4ca3a/lib/domain.js#L146-L170
      listeners = process.listeners('uncaughtException').filter(function(listener) {
        return listener.name !== 'domainUncaughtExceptionClear';
      });
      listeners.length.should.equal(1);
    });

    describe('exit conditions', function() {
      var exitStr = 'exit test assertions complete\n';
      it('should catch an uncaughtException and capture it before exiting', function(done) {
        child_process.exec('node test/exit/capture.js', function(err, stdout, stderr) {
          stdout.should.equal(exitStr);
          stderr.should.startWith('Error: derp');
          done();
        });
      });

      it('should catch an uncaughtException and capture it before calling a provided callback', function(done) {
        child_process.exec('node test/exit/capture_callback.js', function(
          err,
          stdout,
          stderr
        ) {
          err.code.should.equal(20);
          stdout.should.equal(exitStr);
          stderr.should.equal('');
          done();
        });
      });

      it('should catch an uncaughtException and capture it without a second followup exception causing premature shutdown', function(done) {
        child_process.exec('node test/exit/capture_with_second_error.js', function(
          err,
          stdout,
          stderr
        ) {
          stdout.should.equal(exitStr);
          stderr.should.startWith('Error: derp');
          done();
        });
      });

      it('should treat an error thrown by captureException from uncaughtException handler as a sending error passed to onFatalError', function(done) {
        this.timeout(4000);
        child_process.exec('node test/exit/throw_on_send.js', function(
          err,
          stdout,
          stderr
        ) {
          err.code.should.equal(20);
          stdout.should.equal(exitStr);
          stderr.should.equal('');
          done();
        });
      });

      it('should catch a domain exception and capture it before exiting', function(done) {
        child_process.exec('node test/exit/domain_capture.js', function(
          err,
          stdout,
          stderr
        ) {
          stdout.should.equal(exitStr);
          stderr.should.startWith('Error: derp');
          done();
        });
      });

      it('should catch a domain exception and capture it before calling a provided callback', function(done) {
        child_process.exec('node test/exit/domain_capture_callback.js', function(
          err,
          stdout,
          stderr
        ) {
          err.code.should.equal(20);
          stdout.should.equal(exitStr);
          stderr.should.equal('');
          done();
        });
      });

      it('should catch a domain exception and capture it without a second followup exception causing premature shutdown', function(done) {
        child_process.exec('node test/exit/domain_capture_with_second_error.js', function(
          err,
          stdout,
          stderr
        ) {
          stdout.should.equal(exitStr);
          stderr.should.startWith('Error: derp');
          done();
        });
      });

      it('should treat an error thrown by captureException from domain exception handler as a sending error passed to onFatalError', function(done) {
        this.timeout(4000);
        child_process.exec('node test/exit/domain_throw_on_send.js', function(
          err,
          stdout,
          stderr
        ) {
          err.code.should.equal(20);
          stdout.should.equal(exitStr);
          stderr.should.equal('');
          done();
        });
      });

      it('should catch an uncaughtException and capture it without a second followup domain exception causing premature shutdown', function(done) {
        child_process.exec('node test/exit/capture_with_second_domain_error.js', function(
          err,
          stdout,
          stderr
        ) {
          stdout.should.equal(exitStr);
          stderr.should.startWith('Error: derp');
          done();
        });
      });

      it('should catch an uncaughtException and capture it and failsafe shutdown if onFatalError throws', function(done) {
        child_process.exec('node test/exit/throw_on_fatal.js', function(
          err,
          stdout,
          stderr
        ) {
          stdout.should.equal(exitStr);
          stderr.should.startWith('Error: fatal derp');
          done();
        });
      });
    });
  });

  describe('#process()', function() {
    it('should respect dataCallback', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, function(uri, body) {
          zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
            if (err) return done(err);
            var msg = JSON.parse(dec.toString());
            var extra = msg.extra;

            extra.should.not.have.property('foo');
            done();
          });
          return 'OK';
        });

      client = new raven.Client(dsn, {
        dataCallback: function(data) {
          delete data.extra.foo;
          return data;
        }
      });

      client.process({
        message: 'test',
        extra: {
          foo: 'bar'
        }
      });

      client.on('logged', function() {
        scope.done();
      });
    });

    it('should respect shouldSendCallback', function(done) {
      client = new raven.Client(dsn, {
        shouldSendCallback: function(data) {
          return false;
        }
      });

      // neither of these should fire, so report err to done if they do
      client.on('logged', done);
      client.on('error', done);

      client.process(
        {
          message: 'test'
        },
        function(err, eventId) {
          setTimeout(done, 10);
        }
      );
    });

    it('should pass original shouldSendCallback to newer shouldSendCallback', function(done) {
      var cb1 = function(data) {
        return false;
      };

      var cb2 = function(data, original) {
        original.should.equal(cb1);
        return original(data);
      };

      var cb3 = function(data, original) {
        return original(data);
      };

      client = new raven.Client(dsn, {
        shouldSendCallback: cb1
      });

      client.setShouldSendCallback(cb2);
      client.setShouldSendCallback(cb3);

      // neither of these should fire, so report err to done if they do
      client.on('logged', done);
      client.on('error', done);

      client.process(
        {
          message: 'test'
        },
        function(err, eventId) {
          setTimeout(done, 10);
        }
      );
    });

    it('should pass original dataCallback to newer dataCallback', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, function(uri, body, cb) {
          zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
            if (err) return done(err);
            var msg = JSON.parse(dec.toString());
            msg.extra.foo.should.equal('bar');
            cb(null, 'OK');
          });
        });

      var cb1 = function(data) {
        data.extra = {foo: 'bar'};
        return data;
      };

      var cb2 = function(data, original) {
        original.should.equal(cb1);
        return original(data);
      };

      var cb3 = function(data, original) {
        return original(data);
      };

      client = new raven.Client(dsn, {
        dataCallback: cb1
      });

      client.setDataCallback(cb2);
      client.setDataCallback(cb3);

      client.process(
        {
          message: 'test'
        },
        function(err, eventId) {
          scope.done();
          done();
        }
      );
    });

    describe('sampleRate', function() {
      var origRandom;
      beforeEach(function() {
        origRandom = Math.random;
        Math.random = function() {
          return 0.5;
        };
      });

      afterEach(function() {
        Math.random = origRandom;
      });

      it('should respect sampleRate to omit event', function(done) {
        client = new raven.Client(dsn, {
          sampleRate: 0.3
        });

        client.process(
          {
            message: 'test'
          },
          function(err, eventId) {
            setTimeout(done, 10);
          }
        );
      });

      it('should respect sampleRate to include event', function(done) {
        var scope = nock('https://app.getsentry.com')
          .filteringRequestBody(/.*/, '*')
          .post('/api/269/store/', '*')
          .reply(200, function(uri, body) {
            zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
              if (err) return done(err);
              var msg = JSON.parse(dec.toString());
              var extra = msg.extra;

              extra.should.have.property('foo');
              done();
            });
            return 'OK';
          });

        client = new raven.Client(dsn, {
          sampleRate: 0.8
        });

        client.process({
          message: 'test',
          extra: {
            foo: 'bar'
          }
        });

        client.on('logged', function() {
          scope.done();
        });
      });

      it('should always send if sampleRate is omitted', function(done) {
        var scope = nock('https://app.getsentry.com')
          .filteringRequestBody(/.*/, '*')
          .post('/api/269/store/', '*')
          .reply(200, function(uri, body) {
            zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
              if (err) return done(err);
              done();
            });
            return 'OK';
          });

        client.process({
          message: 'test'
        });

        client.on('logged', function() {
          scope.done();
        });
      });
    });

    it('should call the callback after sending', function(done) {
      var firedCallback = false;
      var sentResponse = false;
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .delay(10)
        .reply(200, function(uri, body) {
          zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
            if (err) return done(err);
            var msg = JSON.parse(dec.toString());
            msg.message.should.equal('test');
          });
          firedCallback.should.equal(false);
          sentResponse = true;
          return 'OK';
        });

      client = new raven.Client(dsn);

      client.process(
        {
          message: 'test'
        },
        function() {
          firedCallback = true;
          sentResponse.should.equal(true);
          scope.done();
          done();
        }
      );
    });

    it('should attach environment', function(done) {
      client = new raven.Client(dsn, {
        environment: 'staging'
      });
      client.send = function(kwargs) {
        kwargs.environment.should.equal('staging');
      };
      client.process({message: 'test'});

      client.send = function(kwargs) {
        kwargs.environment.should.equal('production');
        done();
      };
      client.process({
        message: 'test',
        environment: 'production'
      });
    });

    describe('context parsing', function() {
      afterEach(function() {
        process.domain && process.domain.exit();
      });

      it('should parse a req property from context', function(done) {
        var scope = nock('https://app.getsentry.com')
          .filteringRequestBody(/.*/, '*')
          .post('/api/269/store/', '*')
          .reply(200, function(uri, body) {
            zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
              if (err) return done(err);
              var msg = JSON.parse(dec.toString());

              msg.request.method.should.equal('GET');
              msg.request.url.should.equal('https://sentry.io/hello');
              msg.user.should.eql({
                username: 'lewis'
              });

              done();
            });
            return 'OK';
          });

        client.context(function() {
          client.setContext({
            req: {
              protocol: 'https',
              hostname: 'sentry.io',
              url: '/hello',
              method: 'GET',
              user: {
                username: 'lewis'
              }
            }
          });

          setTimeout(function() {
            client.captureException(new Error('foo'), function() {
              scope.done();
            });
          }, 0);
        });
      });

      it('should not attempt to parse an empty req', function(done) {
        var scope = nock('https://app.getsentry.com')
          .filteringRequestBody(/.*/, '*')
          .post('/api/269/store/', '*')
          .reply(200, function(uri, body) {
            zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
              if (err) return done(err);
              var msg = JSON.parse(dec.toString());

              msg.message.should.equal('Error: foo');
              Object.keys(msg.request).should.have.length(0);

              done();
            });
            return 'OK';
          });

        client.context(function() {
          // no req set on context
          setTimeout(function() {
            client.captureException(new Error('foo'), function() {
              scope.done();
            });
          }, 0);
        });
      });
    });
  });

  it('should use a custom transport', function() {
    var expected = {
      protocol: 'https',
      public_key: 'public',
      private_key: 'private',
      host: 'app.getsentry.com',
      path: '/',
      project_id: '269',
      port: 443
    };
    var dsn = 'heka+https://public:private@app.getsentry.com/269';
    var client = new raven.Client(dsn, {
      transport: 'some_heka_instance'
    });
    client.dsn.should.eql(expected);
    client.transport.should.equal('some_heka_instance');
  });

  it('should use a DSN subpath when sending requests', function(done) {
    var dsn = 'https://public:private@app.getsentry.com/some/path/269';
    var client = new raven.Client(dsn);

    var scope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/some/path/api/269/store/', '*')
      .reply(200, 'OK');

    client.on('logged', function() {
      scope.done();
      done();
    });
    client.captureMessage('Hey!');
  });

  it('should capture module information', function(done) {
    var scope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/api/269/store/', '*')
      .reply(200, function(uri, body) {
        zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
          if (err) return done(err);
          var msg = JSON.parse(dec.toString());
          var modules = msg.modules;

          modules.should.have.property('uuid');
          done();
        });
        return 'OK';
      });

    client.on('logged', function() {
      scope.done();
    });
    client.captureException(new Error('wtf?'));
  });

  it('should capture extra data', function(done) {
    client = new raven.Client(dsn, {
      extra: {
        globalContextKey: 'globalContextValue'
      }
    });

    var scope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/api/269/store/', '*')
      .reply(200, function(uri, body) {
        zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
          if (err) return done(err);
          var msg = JSON.parse(dec.toString());
          var extra = msg.extra;

          extra.should.have.property('key');
          extra.key.should.equal('value');
          extra.should.have.property('globalContextKey');
          extra.globalContextKey.should.equal('globalContextValue');

          done();
        });
        return 'OK';
      });

    client.on('logged', function() {
      scope.done();
    });
    client.process({
      message: 'test',
      extra: {
        key: 'value'
      }
    });
  });

  it('should capture tags', function(done) {
    client = new raven.Client(dsn, {
      tags: {
        globalContextKey: 'globalContextValue'
      }
    });
    var scope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/api/269/store/', '*')
      .reply(200, function(uri, body) {
        zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
          if (err) return done(err);
          var msg = JSON.parse(dec.toString());
          var tags = msg.tags;

          tags.should.have.property('key');
          tags.key.should.equal('value');
          tags.should.have.property('globalContextKey');
          tags.globalContextKey.should.equal('globalContextValue');

          done();
        });
        return 'OK';
      });

    client.on('logged', function() {
      scope.done();
    });
    client.process({
      message: 'test',
      tags: {
        key: 'value'
      }
    });
  });

  it('should capture fingerprint', function(done) {
    var scope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/api/269/store/', '*')
      .reply(200, function(uri, body) {
        zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
          if (err) return done(err);
          var msg = JSON.parse(dec.toString());

          msg.fingerprint.length.should.equal(1);
          msg.fingerprint[0].should.equal('foo');

          done();
        });
        return 'OK';
      });

    client.on('logged', function() {
      scope.done();
    });
    client.process({
      message: 'test',
      fingerprint: ['foo']
    });
  });

  it('should capture user', function(done) {
    var scope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/api/269/store/', '*')
      .reply(200, function(uri, body) {
        zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
          if (err) return done(err);
          var msg = JSON.parse(dec.toString());

          msg.user.should.have.property('email', 'matt@example.com');
          msg.user.should.have.property('id', '123');

          done();
        });
        return 'OK';
      });

    var client = new raven.Client(dsn, {
      release: 'version1'
    });

    client.setContext({
      user: {
        email: 'matt@example.com',
        id: '123'
      }
    });

    client.on('logged', function() {
      scope.done();
    });
    client.process({
      message: 'test'
    });
  });

  it('should capture release', function(done) {
    var scope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/api/269/store/', '*')
      .reply(200, function(uri, body) {
        zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
          if (err) return done(err);
          var msg = JSON.parse(dec.toString());

          msg.release.should.equal('version1');

          done();
        });
        return 'OK';
      });

    var client = new raven.Client(dsn, {
      release: 'version1'
    });
    client.on('logged', function() {
      scope.done();
    });
    client.process({
      message: 'test'
    });
  });

  it('should captureBreadcrumb with processed exception', function(done) {
    var calls = 0;
    client = new raven.Client(dsn, {
      shouldSendCallback: function(data) {
        // Don't test first call, as there's no breadcrumbs there
        if (calls === 0) {
          calls += 1;
          return false;
        }

        if (calls === 1) {
          data.breadcrumbs.values.length.should.equal(1);
          data.breadcrumbs.values[0].category.should.equal('sentry');
          data.breadcrumbs.values[0].message.should.equal('Error: foo');
          data.breadcrumbs.values[0].level.should.equal('error');
          client.uninstall();
          done();
        }
      }
    });

    client.install();
    client.captureException(new Error('foo'));
    client.captureException(new Error('bar'));
  });

  describe('#setContext', function() {
    afterEach(function() {
      process.domain && process.domain.exit();
    });

    it('should merge contexts in correct hierarchy', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, function(uri, body) {
          zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
            if (err) return done(err);
            var msg = JSON.parse(dec.toString());

            msg.user.should.eql({
              a: 1,
              b: 2,
              c: 3
            });

            done();
          });
          return 'OK';
        });

      client.setContext({
        user: {
          a: 1,
          b: 1,
          c: 1
        }
      });

      client.context(function() {
        client.setContext({
          user: {
            b: 2,
            c: 2
          }
        });
        client.captureException(
          new Error('foo'),
          {
            user: {
              c: 3
            }
          },
          function() {
            scope.done();
          }
        );
      });
    });
  });

  describe('#intercept()', function() {
    it('should catch an err param', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, function(uri, body) {
          zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
            if (err) return done(err);
            var msg = JSON.parse(dec.toString());
            msg.message.indexOf('foo').should.not.equal(-1);
            done();
          });
          return 'OK';
        });

      client.on('logged', function() {
        scope.done();
      });

      client.interceptErr(function(err) {
        done(new Error('called wrapped function'));
      })(new Error('foo'));
    });

    it('should pass options to captureException', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, function(uri, body) {
          zlib.inflate(Buffer.from(body, 'base64'), function(err, dec) {
            if (err) return done(err);
            var msg = JSON.parse(dec.toString());
            msg.message.indexOf('foo').should.not.equal(-1);
            msg.extra.foo.should.equal('bar');
            done();
          });
          return 'OK';
        });

      client.on('logged', function() {
        scope.done();
      });

      client.interceptErr({extra: {foo: 'bar'}}, function(err) {
        done(new Error('called wrapped function'));
      })(new Error('foo'));
    });

    it('should call original when no err', function(done) {
      client.interceptErr(function(err, result) {
        if (err != null) return done(err);
        result.should.equal('result');
        done();
      })(null, 'result');
    });
  });

  describe('#captureBreadcrumb', function() {
    beforeEach(function() {
      mockConsoleWarn();
    });

    afterEach(function() {
      client.uninstall();
      restoreConsoleWarn();
    });

    it('should capture a breadcrumb', function(done) {
      var message = 'test breadcrumb';
      client.install();
      client.context(function() {
        client.captureBreadcrumb({
          category: 'test',
          message: message
        });
        client.getContext().should.not.equal(client._globalContext);
        client.getContext().breadcrumbs[0].message.should.equal(message);
      });
      done();
    });

    it('should capture breadcrumbs at global context level', function(done) {
      var message = 'test breadcrumb';
      client = new raven.Client(dsn, {
        shouldSendCallback: function(data) {
          data.breadcrumbs.values.length.should.equal(1);
          done();
        }
      });
      client.install();
      client.captureBreadcrumb({
        category: 'test',
        message: message
      });
      client.captureException(new Error('oh no'));
    });

    it('should instrument console to capture breadcrumbs', function(done) {
      client = new raven.Client(dsn, {autoBreadcrumbs: {console: true}});
      client.install();

      client.context(function() {
        console.warn('breadcrumb!');
        client.getContext().breadcrumbs[0].message.should.equal('breadcrumb!');
        done();
      });
    });

    it('should not die to console log of prototypeless object', function(done) {
      client = new raven.Client(dsn, {autoBreadcrumbs: {console: true}});
      client.install();

      client.context(function() {
        var x = Object.create(null);
        x.a = 'b';
        var y = Object.create(null);
        y.c = 'd';
        console.log(x, y);
        client.getContext().breadcrumbs[0].message.should.equal("{ a: 'b' } { c: 'd' }");
        done();
      });
    });

    it('should not die trying to instrument a missing module', function(done) {
      client = new raven.Client(dsn, {autoBreadcrumbs: {pg: true}});
      client.install();
      done();
    });

    describe('http breadcrumbs', function() {
      // prior to streams3 _readableState.flowing started as false, now starts as null
      var initialFlowingState = process.version < 'v0.12' ? false : null;

      beforeEach(function() {
        client = new raven.Client(dsn, {autoBreadcrumbs: {http: true}});
        client.install();
      });

      afterEach(function() {
        client.uninstall();
      });

      it('should instrument http to capture breadcrumbs', function(done) {
        var testUrl = 'http://example.com/';
        var scope = nock(testUrl)
          .get('/')
          .reply(200, 'OK');

        client.context(function() {
          var http = require('http');
          http.get(url.parse(testUrl), function(response) {
            response._readableState.should.have.property('flowing', initialFlowingState);
            // need to wait a tick here because nock will make this callback fire
            // before our req.emit monkeypatch captures the breadcrumb :/
            setTimeout(function() {
              response._readableState.should.have.property(
                'flowing',
                initialFlowingState
              );
              client.getContext().breadcrumbs[0].data.url.should.equal(testUrl);
              client.getContext().breadcrumbs[0].data.status_code.should.equal(200);
              client.getContext().breadcrumbs.length.should.equal(1);
              scope.done();
              done();
            }, 0);
          });
        });
      });

      it('should not double-instrument http', function(done) {
        var testUrl = 'http://example.com/';
        var scope = nock(testUrl)
          .get('/')
          .reply(200, 'OK');

        client.context(function() {
          var http = require('http');
          require('http');
          http.get(url.parse(testUrl), function(response) {
            response._readableState.should.have.property('flowing', initialFlowingState);
            // need to wait a tick here because nock will make this callback fire
            // before our req.emit monkeypatch captures the breadcrumb :/
            setTimeout(function() {
              response._readableState.should.have.property(
                'flowing',
                initialFlowingState
              );
              client.getContext().breadcrumbs[0].data.url.should.equal(testUrl);
              client.getContext().breadcrumbs[0].data.status_code.should.equal(200);
              client.getContext().breadcrumbs.length.should.equal(1);
              scope.done();
              done();
            }, 0);
          });
        });
      });

      it('should instrument http and log non-standard http (:80) port', function(done) {
        var testUrl = 'http://example.com:1337/';
        var scope = nock(testUrl)
          .get('/')
          .reply(200, 'OK');

        client.context(function() {
          var http = require('http');
          http.get(url.parse(testUrl), function(response) {
            response._readableState.should.have.property('flowing', initialFlowingState);
            // need to wait a tick here because nock will make this callback fire
            // before our req.emit monkeypatch captures the breadcrumb :/
            setTimeout(function() {
              response._readableState.should.have.property(
                'flowing',
                initialFlowingState
              );
              client.getContext().breadcrumbs[0].data.url.should.equal(testUrl);
              client.getContext().breadcrumbs[0].data.status_code.should.equal(200);
              client.getContext().breadcrumbs.length.should.equal(1);
              scope.done();
              done();
            }, 0);
          });
        });
      });

      it('should instrument https to capture breadcrumbs', function(done) {
        var testUrl = 'https://example.com/';
        var scope = nock(testUrl)
          .get('/')
          .reply(200, 'OK');

        client.context(function() {
          var https = require('https');
          https.get(url.parse(testUrl), function(response) {
            response._readableState.should.have.property('flowing', initialFlowingState);
            // need to wait a tick here because nock will make this callback fire
            // before our req.emit monkeypatch captures the breadcrumb :/
            setTimeout(function() {
              response._readableState.should.have.property(
                'flowing',
                initialFlowingState
              );
              client.getContext().breadcrumbs[0].data.url.should.equal(testUrl);
              client.getContext().breadcrumbs[0].data.status_code.should.equal(200);
              scope.done();
              done();
            }, 0);
          });
        });
      });

      it('should not capture breadcrumbs for requests to sentry, but should capture exception call itself', function(done) {
        var scope = nock('https://app.getsentry.com')
          .filteringRequestBody(/.*/, '*')
          .post('/api/269/store/', '*')
          .reply(200, 'OK');

        client.context(function() {
          client.captureException(new Error('test'), function() {
            // need to wait a tick because the response handler that captures the breadcrumb might run after this one
            setTimeout(function() {
              client.getContext().breadcrumbs.length.should.equal(1);
              client.getContext().breadcrumbs[0].category.should.equal('sentry');
              scope.done();
              done();
            }, 0);
          });
        });
      });

      it('should instrument https and log non-standard https (:443) port', function(done) {
        var testUrl = 'https://example.com:1337/';
        var scope = nock(testUrl)
          .get('/')
          .reply(200, 'OK');

        client.context(function() {
          var https = require('https');
          https.get(url.parse(testUrl), function(response) {
            response._readableState.should.have.property('flowing', initialFlowingState);
            // need to wait a tick here because nock will make this callback fire
            // before our req.emit monkeypatch captures the breadcrumb :/
            setTimeout(function() {
              response._readableState.should.have.property(
                'flowing',
                initialFlowingState
              );
              client.getContext().breadcrumbs[0].data.url.should.equal(testUrl);
              client.getContext().breadcrumbs[0].data.status_code.should.equal(200);
              scope.done();
              done();
            }, 0);
          });
        });
      });
    });
  });

  describe('#_createRequestObject', function() {
    it('should merge together all sources', function() {
      var req = client._createRequestObject(
        {
          foo: 123
        },
        {
          bar: 42
        }
      );
      var expected = {
        foo: 123,
        bar: 42
      };
      req.should.eql(expected);
    });

    it('should preserve extend-like order', function() {
      var req = client._createRequestObject(
        {
          foo: 111
        },
        {
          foo: 222
        },
        {
          foo: 333
        }
      );
      var expected = {
        foo: 333
      };
      req.should.eql(expected);
    });

    it('should filter incorrect sources', function() {
      var req = client._createRequestObject(
        {
          foo: 111
        },
        [42],
        null,
        'hello',
        {
          foo: 222
        }
      );
      var expected = {
        foo: 222
      };
      req.should.eql(expected);
    });

    it('should extract specified non-enumerables', function() {
      var foo = {};
      Object.defineProperty(foo, 'ip', {
        value: '127.0.0.1',
        enumerable: false
      });
      var bar = {
        foo: 222
      };
      var req = client._createRequestObject(foo, bar);
      var expected = {
        foo: 222,
        ip: '127.0.0.1'
      };
      req.should.eql(expected);
    });

    it('should skip all remaining non-enumerables', function() {
      var foo = {};
      Object.defineProperty(foo, 'ip', {
        value: '127.0.0.1',
        enumerable: false
      });
      Object.defineProperty(foo, 'pickle', {
        value: 'rick',
        enumerable: false
      });
      var bar = {
        dont: 'skip'
      };
      Object.defineProperty(bar, 'evil', {
        value: 'morty',
        enumerable: false
      });
      var req = client._createRequestObject(foo, bar);
      var expected = {
        ip: '127.0.0.1',
        dont: 'skip'
      };
      req.should.eql(expected);
    });
  });
});

describe('raven requestHandler/errorHandler middleware', function() {
  it('should explicitly add req and res to the domain', function(done) {
    var client = new raven.Client(dsn).install();
    var message = 'test breadcrumb';

    var EventEmitter = require('events');
    if (process.version <= 'v0.11') EventEmitter = EventEmitter.EventEmitter; // node 0.10 compat
    var e = new EventEmitter();
    e.on('done', function() {
      // Context won't propagate here without the explicit binding of req/res done in the middleware
      setTimeout(function() {
        client.getContext().breadcrumbs.length.should.equal(1);
        client.getContext().breadcrumbs[0].message.should.equal(message);
        done();
      }, 0);
    });

    // Pass e as the req/res, so e will be added to the domain
    client.requestHandler()(e, e, function() {
      client.captureBreadcrumb({
        message: message,
        category: 'log'
      });
      setTimeout(function() {
        e.emit('done');
      }, 0);
    });
  });
});
