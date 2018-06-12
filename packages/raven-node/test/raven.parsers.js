'use strict';

var util = require('util');
var assert = require('assert');
var raven = require('../');

raven.parsers = require('../lib/parsers');

describe('raven.parsers', function() {
  describe('#parseText()', function() {
    it('should parse some text without kwargs', function() {
      var parsed = raven.parsers.parseText('Howdy');
      parsed.message.should.equal('Howdy');
    });

    it('should parse some text with kwargs', function() {
      var parsed = raven.parsers.parseText('Howdy', {
        foo: 'bar'
      });
      parsed.message.should.equal('Howdy');
      parsed.foo.should.equal('bar');
    });
  });

  describe('#parseRequest()', function() {
    it('should parse a request object', function() {
      var mockReq = {
        method: 'GET',
        url: '/some/path?key=value',
        headers: {
          host: 'mattrobenolt.com'
        },
        body: '',
        cookies: {},
        socket: {
          encrypted: true
        },
        connection: {
          remoteAddress: '127.0.0.1'
        }
      };
      var parsed = raven.parsers.parseRequest(mockReq);
      parsed.should.have.property('request');
      parsed.request.url.should.equal('https://mattrobenolt.com/some/path?key=value');
      parsed.user.ip_address.should.equal('127.0.0.1');
    });

    describe('`headers` detection', function() {
      it('should detect headers via `req.headers`', function() {
        var mockReq = {
          method: 'GET',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value',
          headers: {
            foo: 'bar'
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.headers.should.eql({
          foo: 'bar'
        });
      });

      it('should detect headers via `req.header`', function() {
        var mockReq = {
          method: 'GET',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value',
          header: {
            foo: 'bar'
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.headers.should.eql({
          foo: 'bar'
        });
      });
    });

    describe('`method` detection', function() {
      it('should detect method via `req.method`', function() {
        var mockReq = {
          method: 'GET',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.method.should.equal('GET');
      });
    });

    describe('`host` detection', function() {
      it('should detect host via `req.hostname`', function() {
        var mockReq = {
          method: 'GET',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('http://mattrobenolt.com/some/path?key=value');
      });

      it('should detect host via deprecated `req.host`', function() {
        var mockReq = {
          method: 'GET',
          host: 'mattrobenolt.com',
          url: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('http://mattrobenolt.com/some/path?key=value');
      });

      it('should detect host via `req.header.host`', function() {
        var mockReq = {
          method: 'GET',
          header: {
            host: 'mattrobenolt.com'
          },
          url: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('http://mattrobenolt.com/some/path?key=value');
      });

      it('should detect host via `req.headers.host`', function() {
        var mockReq = {
          method: 'GET',
          headers: {
            host: 'mattrobenolt.com'
          },
          url: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('http://mattrobenolt.com/some/path?key=value');
      });

      it('should fallback to <no host> if host is not available', function() {
        var mockReq = {
          method: 'GET',
          url: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('http://<no host>/some/path?key=value');
      });
    });

    describe('`protocol` detection', function() {
      it('should detect protocol via `req.protocol`', function() {
        var mockReq = {
          method: 'GET',
          url: '/some/path?key=value',
          headers: {
            host: 'mattrobenolt.com'
          },
          protocol: 'https',
          socket: {
            encrypted: false
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('https://mattrobenolt.com/some/path?key=value');
      });

      it('should detect protocol via `req.secure`', function() {
        var mockReq = {
          method: 'GET',
          url: '/some/path?key=value',
          headers: {
            host: 'mattrobenolt.com'
          },
          secure: true,
          socket: {
            encrypted: false
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('https://mattrobenolt.com/some/path?key=value');
      });

      it('should detect protocol via `req.socket.encrypted`', function() {
        var mockReq = {
          method: 'GET',
          url: '/some/path?key=value',
          headers: {
            host: 'mattrobenolt.com'
          },
          socket: {
            encrypted: true
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('https://mattrobenolt.com/some/path?key=value');
      });
    });

    describe('`cookie` detection', function() {
      it('should parse `req.headers.cookie`', function() {
        var mockReq = {
          method: 'GET',
          url: '/some/path?key=value',
          headers: {
            host: 'mattrobenolt.com',
            cookie: 'foo=bar'
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);
        parsed.request.cookies.should.eql({
          foo: 'bar'
        });
      });

      it('should parse `req.header.cookie`', function() {
        var mockReq = {
          method: 'GET',
          url: '/some/path?key=value',
          header: {
            host: 'mattrobenolt.com',
            cookie: 'foo=bar'
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);
        parsed.request.cookies.should.eql({
          foo: 'bar'
        });
      });
    });

    describe('`query` detection', function() {
      it('should detect query via `req.query`', function() {
        var mockReq = {
          method: 'GET',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value',
          query: {
            some: 'key'
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.query_string.should.eql({
          some: 'key'
        });
      });

      it('should detect query via `req.url`', function() {
        var mockReq = {
          method: 'GET',
          hostname: 'mattrobenolt.com',
          url: '/some/path?foo=bar'
        };

        // using assert instead of should here because query_string has no prototype
        // https://github.com/nodejs/node/pull/6289
        var parsed = raven.parsers.parseRequest(mockReq);
        var expected = {foo: 'bar'};
        assert.deepEqual(parsed.request.query_string, expected);
      });
    });

    describe('`ip` detection', function() {
      it('should detect ip via `req.ip`', function() {
        var mockReq = {
          method: 'GET',
          url: '/some/path?key=value',
          headers: {
            hostname: 'mattrobenolt.com'
          },
          ip: '127.0.0.1'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.user.ip_address.should.equal('127.0.0.1');
      });

      it('should detect ip via `req.connection.remoteAddress`', function() {
        var mockReq = {
          method: 'GET',
          url: '/some/path?key=value',
          headers: {
            hostname: 'mattrobenolt.com'
          },
          connection: {
            remoteAddress: '127.0.0.1'
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.user.ip_address.should.equal('127.0.0.1');
      });
    });

    describe('`url` detection', function() {
      it('should detect url via `req.originalUrl`', function() {
        var mockReq = {
          method: 'GET',
          protocol: 'https',
          hostname: 'mattrobenolt.com',
          originalUrl: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('https://mattrobenolt.com/some/path?key=value');
      });

      it('should detect url via `req.url`', function() {
        var mockReq = {
          method: 'GET',
          protocol: 'https',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.url.should.equal('https://mattrobenolt.com/some/path?key=value');
      });
    });

    describe('`body` detection', function() {
      it('should detect body via `req.body`', function() {
        var mockReq = {
          method: 'GET',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value',
          body: 'foo=bar'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.data.should.equal('foo=bar');
      });

      it('should fallback to <unavailable> if body is not available', function() {
        var mockReq = {
          method: 'POST',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        parsed.request.data.should.equal('<unavailable>');
      });

      it('should not fallback to <unavailable> if GET', function() {
        var mockReq = {
          method: 'GET',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value'
        };

        var parsed = raven.parsers.parseRequest(mockReq);

        (typeof parsed.request.data === 'undefined').should.be.ok;
      });

      it('should make sure that body is a string', function() {
        var mockReq = {
          method: 'POST',
          hostname: 'mattrobenolt.com',
          url: '/some/path?key=value',
          body: {
            foo: true
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);
        parsed.request.data.should.equal('{"foo":true}');
      });
    });

    describe('`user` detection', function() {
      it('should assign req.user to kwargs', function() {
        var mockReq = {
          method: 'POST',
          hostname: 'example.org',
          url: '/some/path?key=value',
          user: {
            username: 'janedoe',
            email: 'hello@janedoe.com'
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);
        parsed.should.have.property('user', {
          username: 'janedoe',
          email: 'hello@janedoe.com'
        });
      });

      it('should add ip address to user if available', function() {
        var mockReq = {
          method: 'POST',
          hostname: 'example.org',
          url: '/some/path?key=value',
          ip: '127.0.0.1',
          user: {
            username: 'janedoe',
            email: 'hello@janedoe.com'
          }
        };

        var parsed = raven.parsers.parseRequest(mockReq);
        parsed.should.have.property('user', {
          username: 'janedoe',
          email: 'hello@janedoe.com',
          ip_address: '127.0.0.1'
        });
      });

      describe('parseUser option', function() {
        var mockReq = {
          method: 'POST',
          hostname: 'example.org',
          url: '/some/path?key=value',
          ip: '127.0.0.1',
          user: {
            username: 'janedoe',
            email: 'hello@janedoe.com',
            random: 'random'
          }
        };

        it('should limit to default whitelisted fields', function() {
          var parsed = raven.parsers.parseRequest(mockReq);
          parsed.should.have.property('user', {
            username: 'janedoe',
            email: 'hello@janedoe.com',
            ip_address: '127.0.0.1'
          });
        });

        it('should limit to provided whitelisted fields array', function() {
          var parsed = raven.parsers.parseRequest(mockReq, ['username', 'random']);
          parsed.should.have.property('user', {
            username: 'janedoe',
            random: 'random',
            ip_address: '127.0.0.1'
          });
        });

        it('should parse all fields when passed true', function() {
          var parsed = raven.parsers.parseRequest(mockReq, true);
          parsed.should.have.property('user', {
            username: 'janedoe',
            email: 'hello@janedoe.com',
            random: 'random',
            ip_address: '127.0.0.1'
          });
        });

        it('should parse nothing when passed false', function() {
          var parsed = raven.parsers.parseRequest(mockReq, false);
          parsed.should.not.have.property('user');
        });

        it('should take a custom parsing function', function() {
          var parsed = raven.parsers.parseRequest(mockReq, function(req) {
            return {user: req.user.username};
          });
          parsed.should.have.property('user', {
            user: 'janedoe',
            ip_address: '127.0.0.1'
          });
        });
      });
    });
  });

  describe('#parseError()', function() {
    it('should parse plain Error object', function(done) {
      raven.parsers.parseError(new Error(), {}, function(parsed) {
        parsed.message.should.equal('Error: <no message>');
        parsed.should.have.property('exception');
        parsed.exception[0].type.should.equal('Error');
        parsed.exception[0].value.should.equal('');
        parsed.exception[0].stacktrace.should.have.property('frames');
        done();
      });
    });

    it('should parse Error with message', function(done) {
      raven.parsers.parseError(new Error('Crap'), {}, function(parsed) {
        parsed.message.should.equal('Error: Crap');
        parsed.should.have.property('exception');
        parsed.exception[0].type.should.equal('Error');
        parsed.exception[0].value.should.equal('Crap');
        parsed.exception[0].stacktrace.should.have.property('frames');
        done();
      });
    });

    it('should parse TypeError with message', function(done) {
      raven.parsers.parseError(new TypeError('Crap'), {}, function(parsed) {
        parsed.message.should.equal('TypeError: Crap');
        parsed.should.have.property('exception');
        parsed.exception[0].type.should.equal('TypeError');
        parsed.exception[0].value.should.equal('Crap');
        parsed.exception[0].stacktrace.should.have.property('frames');
        done();
      });
    });

    it('should parse thrown Error', function(done) {
      try {
        throw new Error('Derp');
      } catch (e) {
        raven.parsers.parseError(e, {}, function(parsed) {
          parsed.message.should.equal('Error: Derp');
          parsed.should.have.property('exception');
          parsed.exception[0].type.should.equal('Error');
          parsed.exception[0].value.should.equal('Derp');
          parsed.exception[0].stacktrace.should.have.property('frames');
          done();
        });
      }
    });

    it('should allow specifying a custom `culprit`', function(done) {
      try {
        throw new Error('Foobar');
      } catch (e) {
        raven.parsers.parseError(
          e,
          {
            culprit: 'foobar'
          },
          function(parsed) {
            parsed.culprit.should.equal('foobar');
            done();
          }
        );
      }
    });

    it('should allow specifying a custom `transaction`', function(done) {
      try {
        throw new Error('Foobar');
      } catch (e) {
        raven.parsers.parseError(
          e,
          {
            transaction: 'foobar'
          },
          function(parsed) {
            parsed.transaction.should.equal('foobar');
            done();
          }
        );
      }
    });

    it('should have a string stack after parsing', function(done) {
      try {
        throw new Error('Derp');
      } catch (e) {
        raven.parsers.parseError(e, {}, function(parsed) {
          e.stack.should.be.a.String;
          done();
        });
      }
    });

    it('should parse caught real error', function(done) {
      /* eslint new-cap:0 */
      try {
        var o = {};
        o['...'].Derp();
      } catch (e) {
        raven.parsers.parseError(e, {}, function(parsed) {
          parsed.message.should.containEql('TypeError');
          parsed.message.should.containEql('Derp');
          parsed.should.have.property('exception');
          parsed.exception[0].type.should.equal('TypeError');
          parsed.exception[0].value.should.containEql('Derp');
          parsed.exception[0].stacktrace.should.have.property('frames');
          done();
        });
      }
    });

    it('should parse an error with additional information', function(done) {
      try {
        var err = new Error('boom');
        err.prop = 'value';
        throw err;
      } catch (e) {
        raven.parsers.parseError(e, {}, function(parsed) {
          parsed.should.have.property('exception');
          parsed.exception[0].stacktrace.should.have.property('frames');
          parsed.should.have.property('extra');
          parsed.extra.should.have.property('Error');
          parsed.extra.Error.should.have.property('prop');
          parsed.extra.Error.prop.should.equal('value');
          done();
        });
      }
    });

    it('should read name from an Error constructor', function(done) {
      var err = new Error();
      raven.parsers.parseError(err, {}, function(parsed) {
        parsed.message.should.equal('Error: <no message>');
        parsed.exception[0].type.should.equal('Error');
        done();
      });
    });

    it('should read name from an Error constructor for custom errors', function(done) {
      // https://gist.github.com/justmoon/15511f92e5216fa2624b
      function CustomError(message) {
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.message = message;
      }

      util.inherits(CustomError, Error);

      var err = new CustomError('boom');
      raven.parsers.parseError(err, {}, function(parsed) {
        parsed.message.should.equal('CustomError: boom');
        parsed.exception[0].type.should.equal('CustomError');
        done();
      });
    });

    it('should allow for overriding name for built-in errors', function(done) {
      var err = new Error();
      err.name = 'foo';
      raven.parsers.parseError(err, {}, function(parsed) {
        parsed.message.should.equal('foo: <no message>');
        parsed.exception[0].type.should.equal('foo');
        done();
      });
    });

    it('should allow for overriding name for custom errors', function(done) {
      // https://gist.github.com/justmoon/15511f92e5216fa2624b
      function CustomError(message) {
        Error.captureStackTrace(this, this.constructor);
        this.name = 'foo';
        this.message = message;
      }

      util.inherits(CustomError, Error);

      var err = new CustomError('boom');
      raven.parsers.parseError(err, {}, function(parsed) {
        parsed.message.should.equal('foo: boom');
        parsed.exception[0].type.should.equal('foo');
        done();
      });
    });

    it('should parse Error with non-string type', function(done) {
      var err = new Error();
      err.name = {};
      raven.parsers.parseError(err, {}, function(parsed) {
        parsed.message.should.equal('[object Object]: <no message>');
        parsed.exception[0].type.should.equal('[object Object]');
        parsed.exception[0].value.should.equal('');
        done();
      });
    });
  });
});
