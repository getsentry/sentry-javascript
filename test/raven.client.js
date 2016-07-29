/*eslint no-shadow:0*/
'use strict';

var raven = require('../'),
  nock = require('nock'),
  mockudp = require('mock-udp'),
  zlib = require('zlib');

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
    raven.version.should.match(/^\d+\.\d+\.\d+(-\w+)?$/);
  });

  it('should match package.json', function() {
    var version = require('../package.json').version;
    raven.version.should.equal(version);
  });
});

describe('raven.Client', function() {
  var client;
  beforeEach(function() {
    client = new raven.Client(dsn);
  });

  it('should parse the DSN with options', function() {
    var expected = {
      protocol: 'https',
      public_key: 'public',
      private_key: 'private',
      host: 'app.getsentry.com',
      path: '/',
      project_id: 269,
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
      project_id: 1,
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
      project_id: 1,
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

  describe('#getIdent()', function() {
    it('should match', function() {
      var result = {
        id: 'c988bf5cb7db4653825c92f6864e7206',
      };
      client.getIdent(result).should.equal('c988bf5cb7db4653825c92f6864e7206');
    });
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

    it('shouldn\'t shit it\'s pants when error is emitted without a listener', function() {
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
  });

  describe('#captureError()', function() {
    it('should send an Error to Sentry server', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, 'OK');

      client.on('logged', function() {
        scope.done();
        done();
      });
      client.captureError(new Error('wtf?'));
    });

    it('should send a plain text "error" with a synthesized stack', function(done) {
      var old = client.send;
      client.send = function mockSend(kwargs) {
        client.send = old;

        kwargs.message.should.equal('Error: wtf?');
        kwargs.should.have.property('exception');
        var stack = kwargs.exception[0].stacktrace;
        stack.frames[stack.frames.length - 1].function.should.equal('Client.captureError');
        done();
      };
      client.captureError('wtf?');
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
      client.captureError(new Error('wtf?'));
    });

    it('should send an Error to Sentry server over UDP', function(done) {
      var scope = mockudp('app.getsentry.com:1234');

      var dsn = 'udp://public:private@app.getsentry.com:1234/269';
      var client = new raven.Client(dsn);
      client.on('logged', function() {
        scope.done();
        done();
      });
      client.captureError(new Error('wtf?'));
    });

    it('shouldn\'t choke on circular references', function(done) {
      // See: https://github.com/mattrobenolt/raven-node/pull/46
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, 'OK');

      client.on('logged', function() {
        scope.done();
        done();
      });
      // create circular reference
      var kwargs = {
        extra: {}
      };
      kwargs.extra.kwargs = kwargs;
      client.captureError(new Error('wtf?'), kwargs);
    });
  });

  describe('#patchGlobal()', function() {
    beforeEach(function() {
      // remove existing uncaughtException handlers
      this.uncaughtBefore = process.listeners('uncaughtException');
      process.removeAllListeners('uncaughtException');
    });

    afterEach(function() {
      var uncaughtBefore = this.uncaughtBefore;
      // restore things to how they were
      for (var i = 0; i < uncaughtBefore.length; i++) {
        process.addListener('uncaughtException', uncaughtBefore[i]);
      }
    });

    it('should add itself to the uncaughtException event list', function() {
      var listeners = process.listeners('uncaughtException');
      listeners.length.should.equal(0);

      client.patchGlobal();

      listeners = process.listeners('uncaughtException');
      listeners.length.should.equal(1);
    });

    it('should send an uncaughtException to Sentry server', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, 'OK');

      client.on('logged', function() {
        scope.done();
        done();
      });
      client.patchGlobal();
      process.emit('uncaughtException', new Error('derp'));
    });

    it('should trigger a callback after an uncaughtException', function(done) {
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, 'OK');

      client.patchGlobal(function() {
        scope.done();
        done();
      });
      process.emit('uncaughtException', new Error('derp'));
    });

    it('should not enter in recursion when an error is thrown on client request', function(done) {
      var transportBefore = client.transport.send;

      client.transport.send = function() {
        throw new Error('foo');
      };

      client.patchGlobal(function(success, err) {
        success.should.eql(false);
        err.should.be.instanceOf(Error);
        err.message.should.equal('foo');

        client.transport.send = transportBefore;

        done();
      });


      process.emit('uncaughtException', new Error('derp'));
    });
  });

  describe('#process()', function() {
    it('should respect dataCallback', function(done) {
      client = new raven.Client(dsn);
      var scope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/269/store/', '*')
        .reply(200, function(uri, body) {
          zlib.inflate(new Buffer(body, 'base64'), function(err, dec) {
            if (err) return done(err);
            var msg = JSON.parse(dec.toString());
            var extra = msg.extra;

            extra.should.not.have.property('foo');
            done();
          });
          return 'OK';
        });

      var client = new raven.Client(dsn, {
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
  });

  it('should use a custom transport', function() {
    var expected = {
      protocol: 'udp',
      public_key: 'public',
      private_key: 'private',
      host: 'app.getsentry.com',
      path: '/',
      project_id: 269,
      port: 443
    };
    var dsn = 'heka+udp://public:private@app.getsentry.com/269';
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
        zlib.inflate(new Buffer(body, 'base64'), function(err, dec) {
          if (err) return done(err);
          var msg = JSON.parse(dec.toString());
          var modules = msg.modules;

          modules.should.have.property('lsmod');
          modules.should.have.property('node-uuid');
          done();
        });
        return 'OK';
      });

    client.on('logged', function() {
      scope.done();
    });
    client.captureError(new Error('wtf?'));
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
        zlib.inflate(new Buffer(body, 'base64'), function(err, dec) {
          if (err) return done(err);
          var msg = JSON.parse(dec.toString());
          var extra = msg.extra;

          extra.should.have.property('key');
          extra.key.should.equal('value');
          extra.should.have.property('globalContextKey');
          extra.globalContextKey.should.equal('globalContextValue')

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
        zlib.inflate(new Buffer(body, 'base64'), function(err, dec) {
          if (err) return done(err);
          var msg = JSON.parse(dec.toString());
          var tags = msg.tags;

          tags.should.have.property('key');
          tags.key.should.equal('value');
          tags.should.have.property('globalContextKey');
          tags.globalContextKey.should.equal('globalContextValue')

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
        zlib.inflate(new Buffer(body, 'base64'), function(err, dec) {
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
          zlib.inflate(new Buffer(body, 'base64'), function(err, dec) {
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

    client.setUserContext({
      email: 'matt@example.com',
      id: '123'
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
        zlib.inflate(new Buffer(body, 'base64'), function(err, dec) {
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

  describe('#setUserContext()', function() {
    it('should add the user object to the globalContext', function () {
      var user = {
        email: 'matt@example.com', // <-- my fave user
        id: '123'
      };

      client.setUserContext(user);

      client._globalContext.user.should.equal(user);
    });
  });

  describe('#setExtraContext()', function() {
    it('should merge the extra data object into the globalContext', function () {
      // when no pre-existing context
      client.setExtraContext({
        bar: 'baz'
      });

      client._globalContext.extra.should.have.property('bar', 'baz');

      client.setExtraContext({ // should merge onto previous
        foo: 'bar'
      });

      client._globalContext.extra.should.have.property('foo', 'bar');
      client._globalContext.extra.should.have.property('bar', 'baz');
    });
  });

  describe('#setTagsContext()', function() {
    it('should merge the extra data object into the globalContext', function () {
      // when no pre-existing context
      client.setTagsContext({
        browser: 'Chrome'
      });

      client._globalContext.tags.should.have.property('browser', 'Chrome');

      client.setTagsContext({ // should merge onto previous
        platform: 'OS X'
      });

      client._globalContext.tags.should.have.property('browser', 'Chrome');
      client._globalContext.tags.should.have.property('platform', 'OS X');
    });
  });
});
