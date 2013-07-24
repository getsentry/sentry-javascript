function flushRavenState() {
  Raven.cachedAuth = undefined;
  Raven.hasJSON = !Raven.isUndefined(window.JSON);
  Raven.server = undefined;
  Raven.project = undefined;
  Raven.user = undefined;
  Raven.options = {
    logger: 'javascript',
    ignoreErrors: [],
    ignoreUrls: [],
    whitelistUrls: [],
    includePaths: [],
    tags: {}
  };
  Raven.uninstall();
}

var imageCache = [];
window.Image = function Image() {
  imageCache.push(this);
};

// window.console must be stubbed in for browsers that don't have it
if (typeof window.console === 'undefined') {
  console = {error: function(){}};
}

var SENTRY_DSN = 'http://abc@example.com:80/2';

function setupRaven() {
  Raven.config(SENTRY_DSN);
}


describe('globals', function() {
  beforeEach(function() {
    setupRaven();
    Raven.options.fetchContext = true;
  });

  afterEach(function() {
    flushRavenState();
  });

  it('should not have TraceKit on window', function() {
    assert.isUndefined(window.TraceKit);
  });

  it('should have a local TK', function() {
    assert.isObject(TK);
  });

  describe('getHttpData', function() {
    var data = Raven.getHttpData();

    it('should have a url', function() {
        assert.equal(data.url, window.location.href);
    });

    it('should have the user-agent header', function() {
      assert.equal(data.headers['User-Agent'], navigator.userAgent);
    });

    it('should have referer header when available', function() {
      // lol this test is awful
      if (window.document.referrer) {
        assert.equal(data.headers.Referer, window.document.referrer);
      } else {
        assert.isUndefined(data.headers.Referer);
      }
    });

  });

  describe('isUndefined', function() {
    it('should do as advertised', function() {
      assert.isTrue(Raven.isUndefined());
      assert.isFalse(Raven.isUndefined({}));
      assert.isFalse(Raven.isUndefined(''));
      assert.isTrue(Raven.isUndefined(undefined));
    });
  });

  describe('isFunction', function() {
    it('should do as advertised', function() {
      assert.isTrue(Raven.isFunction(function(){}));
      assert.isFalse(Raven.isFunction({}));
      assert.isFalse(Raven.isFunction(''));
      assert.isFalse(Raven.isFunction(undefined));
    });
  });

  describe('isSetup', function() {
    it('should return false with no JSON support', function() {
      Raven.server = 'http://localhost/';
      Raven.hasJSON = false;
      assert.isFalse(Raven.isSetup());
    });

    it('should return false when Raven is not configured and write to console.error', function() {
      Raven.hasJSON = true;  // be explicit
      Raven.server = undefined;
      this.sinon.stub(console, 'error');
      assert.isFalse(Raven.isSetup());
      assert.isTrue(console.error.calledOnce);
    });

    it('should return true when everything is all gravy', function() {
      Raven.hasJSON = true;
      setupRaven();
      assert.isTrue(Raven.isSetup());
    });
  });

  describe('getAuthQueryString', function() {
    it('should return a properly formatted string and cache it', function() {
      setupRaven();
      var expected = '?sentry_version=3&sentry_client=raven-js/@VERSION&sentry_key=abc';
      assert.strictEqual(Raven.getAuthQueryString(), expected);
      assert.strictEqual(Raven.cachedAuth, expected);
    });

    it('should return cached value when it exists', function() {
      Raven.cachedAuth = 'lol';
      assert.strictEqual(Raven.getAuthQueryString(), 'lol');
    });
  });

  describe('parseUri', function() {
    it('should do what it advertises', function() {
      var pieces = Raven.parseUri(SENTRY_DSN);
      assert.strictEqual(pieces.protocol, 'http');
      assert.strictEqual(pieces.user, 'abc');
      assert.strictEqual(pieces.port, '80');
      assert.strictEqual(pieces.path, '/2');
      assert.strictEqual(pieces.host, 'example.com');
    });
  });

  describe('normalizeFrame', function() {
    it('should handle a normal frame', function() {
      var context = [
        ['line1'],  // pre
        'line2',    // culprit
        ['line3']   // post
      ];
      this.sinon.stub(Raven, 'extractContextFromFrame').returns(context);
      var frame = {
        url: 'http://example.com/path/file.js',
        line: 10,
        column: 11,
        func: 'lol'
        // context: []  context is stubbed
      };

      Raven.options.fetchContext = true;

      assert.deepEqual(Raven.normalizeFrame(frame), {
        filename: 'http://example.com/path/file.js',
        lineno: 10,
        colno: 11,
        'function': 'lol',
        pre_context: ['line1'],
        context_line: 'line2',
        post_context: ['line3'],
        in_app: true
      });
    });

    it('should handle a frame without context', function() {
      this.sinon.stub(Raven, 'extractContextFromFrame').returns(undefined);
      var frame = {
        url: 'http://example.com/path/file.js',
        line: 10,
        column: 11,
        func: 'lol'
        // context: []  context is stubbed
      };

      Raven.options.fetchContext = true;

      assert.deepEqual(Raven.normalizeFrame(frame), {
        filename: 'http://example.com/path/file.js',
        lineno: 10,
        colno: 11,
        'function': 'lol',
        in_app: true
      });
    });

    it('should not mark `in_app` if rules match', function() {
      this.sinon.stub(Raven, 'extractContextFromFrame').returns(undefined);
      var frame = {
        url: 'http://example.com/path/file.js',
        line: 10,
        column: 11,
        func: 'lol'
        // context: []  context is stubbed
      };

      Raven.options.fetchContext = true;
      Raven.options.includePaths = /^http:\/\/example\.com/;

      assert.deepEqual(Raven.normalizeFrame(frame), {
        filename: 'http://example.com/path/file.js',
        lineno: 10,
        colno: 11,
        'function': 'lol',
        in_app: true
      });
    });

    it('should mark `in_app` if rules do not match', function() {
      this.sinon.stub(Raven, 'extractContextFromFrame').returns(undefined);
      var frame = {
        url: 'http://lol.com/path/file.js',
        line: 10,
        column: 11,
        func: 'lol'
        // context: []  context is stubbed
      };

      Raven.options.fetchContext = true;
      Raven.options.includePaths = /^http:\/\/example\.com/;

      assert.deepEqual(Raven.normalizeFrame(frame), {
        filename: 'http://lol.com/path/file.js',
        lineno: 10,
        colno: 11,
        'function': 'lol',
        in_app: false
      });
    });
  });

  describe('extractContextFromFrame', function() {
    it('should handle a normal frame', function() {
      var frame = {
        column: 2,
        context: [
          'line1',
          'line2',
          'line3',
          'line4',
          'line5',
          'culprit',
          'line7',
          'line8',
          'line9',
          'line10',
          'line11'
        ]
      };
      var context = Raven.extractContextFromFrame(frame);
      assert.deepEqual(context, [
        ['line1', 'line2', 'line3', 'line4', 'line5'],
        'culprit',
        ['line7', 'line8', 'line9', 'line10', 'line11']
      ]);
    });

    it('should return nothing if there is no context', function() {
      var frame = {
        column: 2
      };
      assert.isUndefined(Raven.extractContextFromFrame(frame));
    });

    it('should reject a context if a line is too long without a column', function() {
      var frame = {
        context: [
          new Array(1000).join('f')  // generate a line that is 1000 chars long
        ]
      };
      assert.isUndefined(Raven.extractContextFromFrame(frame));
    });

    it('should reject a minified context with fetchContext disabled', function() {
      var frame = {
        column: 2,
        context: [
          'line1',
          'line2',
          'line3',
          'line4',
          'line5',
          'culprit',
          'line7',
          'line8',
          'line9',
          'line10',
          'line11'
        ]
      };
      Raven.options.fetchContext = false;
      assert.isUndefined(Raven.extractContextFromFrame(frame));
    });

    it('should truncate the minified line if there is a column number without sourcemaps enabled', function() {
      // Note to future self:
      // Array(51).join('f').length === 50
      var frame = {
        column: 2,
        context: [
          'aa' + (new Array(51).join('f')) + (new Array(500).join('z'))
        ]
      };
      assert.deepEqual(Raven.extractContextFromFrame(frame), [[], new Array(51).join('f'), []]);
    });
  });

  describe('processException', function() {
    it('should respect `ignoreErrors`', function() {
      this.sinon.stub(Raven, 'send');

      Raven.options.ignoreErrors = ['e1', 'e2'];
      Raven.processException('Error', 'e1', 'http://example.com', []);
      assert.isFalse(Raven.send.called);
      Raven.processException('Error', 'e2', 'http://example.com', []);
      assert.isFalse(Raven.send.called);
      Raven.processException('Error', 'error', 'http://example.com', []);
      assert.isTrue(Raven.send.calledOnce);
    });

    it('should respect `ignoreUrls`', function() {
      this.sinon.stub(Raven, 'send');

      Raven.options.ignoreUrls = Raven.joinRegExp([/.+?host1.+/, /.+?host2.+/]);
      Raven.processException('Error', 'error', 'http://host1/', []);
      assert.isFalse(Raven.send.called);
      Raven.processException('Error', 'error', 'http://host2/', []);
      assert.isFalse(Raven.send.called);
      Raven.processException('Error', 'error', 'http://host3/', []);
      assert.isTrue(Raven.send.calledOnce);
    });

    it('should respect `whitelistUrls`', function() {
      this.sinon.stub(Raven, 'send');

      Raven.options.whitelistUrls = Raven.joinRegExp([/.+?host1.+/, /.+?host2.+/]);
      Raven.processException('Error', 'error', 'http://host1/', []);
      assert.equal(Raven.send.callCount, 1);
      Raven.processException('Error', 'error', 'http://host2/', []);
      assert.equal(Raven.send.callCount, 2);
      Raven.processException('Error', 'error', 'http://host3/', []);
      assert.equal(Raven.send.callCount, 2);
    });

    it('should send a proper payload with frames', function() {
      this.sinon.stub(Raven, 'send');

      var frames = [
        {
          filename: 'http://example.com/file1.js'
        },
        {
          filename: 'http://example.com/file2.js'
        }
      ];

      Raven.processException('Error', 'lol', 'http://example.com/override.js', 10, frames, {});
      assert.deepEqual(Raven.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: frames
        },
        culprit: 'http://example.com/override.js',
        message: 'lol at 10'
      }]);

      Raven.processException('Error', 'lol', '', 10, frames, {});
      assert.deepEqual(Raven.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: frames
        },
        culprit: 'http://example.com/file1.js',
        message: 'lol at 10'
      }]);

      Raven.processException('Error', 'lol', '', 10, frames, {extra: 'awesome'});
      assert.deepEqual(Raven.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: frames
        },
        culprit: 'http://example.com/file1.js',
        message: 'lol at 10',
        extra: 'awesome'
      }]);
    });

    it('should send a proper payload without frames', function() {
      this.sinon.stub(Raven, 'send');

      Raven.processException('Error', 'lol', 'http://example.com/override.js', 10, [], {});
      assert.deepEqual(Raven.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: [{
            filename: 'http://example.com/override.js',
            lineno: 10
          }]
        },
        culprit: 'http://example.com/override.js',
        message: 'lol at 10'
      }]);

      Raven.processException('Error', 'lol', 'http://example.com/override.js', 10, [], {});
      assert.deepEqual(Raven.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: [{
            filename: 'http://example.com/override.js',
            lineno: 10
          }]
        },
        culprit: 'http://example.com/override.js',
        message: 'lol at 10'
      }]);

      Raven.processException('Error', 'lol', 'http://example.com/override.js', 10, [], {extra: 'awesome'});
      assert.deepEqual(Raven.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: [{
            filename: 'http://example.com/override.js',
            lineno: 10
          }]
        },
        culprit: 'http://example.com/override.js',
        message: 'lol at 10',
        extra: 'awesome'
      }]);
    });
  });

  describe('send', function() {
    it('should check `isSetup`', function() {
      this.sinon.stub(Raven, 'isSetup').returns(false);
      this.sinon.stub(Raven, 'makeRequest');

      Raven.send();
      assert.isTrue(Raven.isSetup.calledOnce);
      assert.isFalse(Raven.makeRequest.calledOnce);
    });

    it('should build a good data payload', function() {
      this.sinon.stub(Raven, 'isSetup').returns(true);
      this.sinon.stub(Raven, 'makeRequest');
      this.sinon.stub(Raven, 'getHttpData').returns({
        url: 'http://localhost/?a=b',
        headers: {'User-Agent': 'lolbrowser'}
      });

      Raven.project = 2;
      Raven.options = {
        logger: 'javascript',
        site: 'THE BEST'
      };

      Raven.send({foo: 'bar'});
      assert.deepEqual(Raven.makeRequest.lastCall.args[0], {
        project: 2,
        logger: 'javascript',
        site: 'THE BEST',
        platform: 'javascript',
        'sentry.interfaces.Http': {
          url: 'http://localhost/?a=b',
          headers: {
            'User-Agent': 'lolbrowser'
          }
        },
        foo: 'bar'
      });
    });

    it('should build a good data payload with a User', function() {
      this.sinon.stub(Raven, 'isSetup').returns(true);
      this.sinon.stub(Raven, 'makeRequest');
      this.sinon.stub(Raven, 'getHttpData').returns({
        url: 'http://localhost/?a=b',
        headers: {'User-Agent': 'lolbrowser'}
      });

      Raven.project = 2;
      Raven.options = {
        logger: 'javascript',
        site: 'THE BEST'
      };

      Raven.user = {name: 'Matt'};

      Raven.send({foo: 'bar'});
      assert.deepEqual(Raven.makeRequest.lastCall.args, [{
        project: 2,
        logger: 'javascript',
        site: 'THE BEST',
        platform: 'javascript',
        'sentry.interfaces.Http': {
          url: 'http://localhost/?a=b',
          headers: {
            'User-Agent': 'lolbrowser'
          }
        },
        'sentry.interfaces.User': {
          name: 'Matt'
        },
        foo: 'bar'
      }]);
    });

    it('should merge in tags', function() {
      this.sinon.stub(Raven, 'isSetup').returns(true);
      this.sinon.stub(Raven, 'makeRequest');
      this.sinon.stub(Raven, 'getHttpData').returns({
        url: 'http://localhost/?a=b',
        headers: {'User-Agent': 'lolbrowser'}
      });

      Raven.project = 2;
      Raven.options = {
        logger: 'javascript',
        site: 'THE BEST',
        tags: {tag1: 'value1'}
      };

      Raven.send({tags: {tag2: 'value2'}});
      assert.deepEqual(Raven.makeRequest.lastCall.args, [{
        project: 2,
        logger: 'javascript',
        site: 'THE BEST',
        platform: 'javascript',
        'sentry.interfaces.Http': {
          url: 'http://localhost/?a=b',
          headers: {
            'User-Agent': 'lolbrowser'
          }
        },
        tags: {tag1: 'value1', tag2: 'value2'}
      }]);
    });

    it('should let dataCallback override everything', function() {
      this.sinon.stub(Raven, 'isSetup').returns(true);
      this.sinon.stub(Raven, 'makeRequest');

      Raven.options = {
        projectId: 2,
        logger: 'javascript',
        site: 'THE BEST',
        dataCallback: function() {
          return {lol: 'ibrokeit'};
        }
      };

      Raven.user = {name: 'Matt'};

      Raven.send({foo: 'bar'});
      assert.deepEqual(Raven.makeRequest.lastCall.args, [{
        lol: 'ibrokeit'
      }]);
    });
  });

  describe('makeRequest', function() {
    it('should load an Image', function() {
      imageCache = [];
      this.sinon.stub(Raven, 'getAuthQueryString').returns('?lol');
      Raven.server = 'http://localhost/';

      Raven.makeRequest({foo: 'bar'});
      assert.equal(imageCache.length, 1);
      assert.equal(imageCache[0].src, 'http://localhost/?lol&sentry_data=%7B%22foo%22%3A%22bar%22%7D');
    });
  });

  describe('handleStackInfo', function() {
    it('should work as advertised', function() {
      var frame = {url: 'http://example.com'};
      this.sinon.stub(Raven, 'normalizeFrame').returns(frame);
      this.sinon.stub(Raven, 'processException');

      var stackInfo = {
        name: 'Matt',
        message: 'hey',
        url: 'http://example.com',
        lineno: 10,
        stack: [
          frame, frame
        ]
      };

      Raven.handleStackInfo(stackInfo, {foo: 'bar'});
      assert.deepEqual(Raven.processException.lastCall.args, [
        'Matt', 'hey', 'http://example.com', 10, [frame, frame], {foo: 'bar'}
      ]);
    });

    it('should work as advertised #integration', function() {
      this.sinon.stub(Raven, 'makeRequest');
      setupRaven();
      var stackInfo = {
        name: 'Error',
        message: 'crap',
        url: 'http://example.com',
        lineno: 10,
        stack: [
          {
            url: 'http://example.com/file1.js',
            line: 10,
            column: 11,
            func: 'broken',
            context: [
              'line1',
              'line2',
              'line3'
            ]
          },
          {
            url: 'http://example.com/file2.js',
            line: 12,
            column: 13,
            func: 'lol',
            context: [
              'line4',
              'line5',
              'line6'
            ]
          }
        ]
      };

      Raven.handleStackInfo(stackInfo, {foo: 'bar'});
      assert.isTrue(Raven.makeRequest.calledOnce);
      /* This is commented out because chai is broken.

      assert.deepEqual(Raven.makeRequest.lastCall.args, [{
        project: 2,
        logger: 'javascript',
        platform: 'javascript',
        'sentry.interfaces.Http': {
          url: window.location.protocol + '//' + window.location.host + window.location.pathname,
          querystring: window.location.search.slice(1)
        },
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'crap'
        },
        'sentry.interfaces.Stacktrace': {
          frames: [{
            filename: 'http://example.com/file1.js',
            filename: 'file1.js',
            lineno: 10,
            colno: 11,
            'function': 'broken',
            post_context: ['line3'],
            context_line: 'line2',
            pre_context: ['line1']
          }, {
            filename: 'http://example.com/file2.js',
            filename: 'file2.js',
            lineno: 12,
            colno: 13,
            'function': 'lol',
            post_context: ['line6'],
            context_line: 'line5',
            pre_context: ['line4']
          }]
        },
        culprit: 'http://example.com',
        message: 'crap at 10',
        foo: 'bar'
      }]);
      */
    });
  });

  it('should ignore frames that dont have a url', function() {
    this.sinon.stub(Raven, 'normalizeFrame').returns(undefined);
    this.sinon.stub(Raven, 'processException');

    var stackInfo = {
      name: 'Matt',
      message: 'hey',
      url: 'http://example.com',
      lineno: 10,
      stack: new Array(2)
    };

    Raven.handleStackInfo(stackInfo, {foo: 'bar'});
    assert.deepEqual(Raven.processException.lastCall.args, [
      'Matt', 'hey', 'http://example.com', 10, [], {foo: 'bar'}
    ]);
  });

  it('should not shit when there is no stack object from TK', function() {
    this.sinon.stub(Raven, 'normalizeFrame').returns(undefined);
    this.sinon.stub(Raven, 'processException');

    var stackInfo = {
      name: 'Matt',
      message: 'hey',
      url: 'http://example.com',
      lineno: 10
      // stack: new Array(2)
    };

    Raven.handleStackInfo(stackInfo);
    assert.isFalse(Raven.normalizeFrame.called);
    assert.deepEqual(Raven.processException.lastCall.args, [
      'Matt', 'hey', 'http://example.com', 10, [], undefined
    ]);
  });
});

describe('Raven (public API)', function() {
  afterEach(function() {
    flushRavenState();
  });

  describe('.VERSION', function() {
    it('should have a version', function() {
      assert.isString(Raven.VERSION);
    });
  });

  describe('callback function', function() {
    it('should callback a function if it is global', function() {
      window.RavenConfig = {
        dsn: "http://random@some.other.server:80/2",
        config: {some: 'config'}
      };

      this.sinon.stub(Raven, 'isSetup').returns(false);
      this.sinon.stub(TK.report, 'subscribe');

      Raven.afterLoad();

      assert.equal(Raven.key, 'random');
      assert.equal(Raven.server, 'http://some.other.server:80/api/2/store/');
      assert.deepEqual(Raven.options.ignoreErrors, ['Script error.'], 'it should install "Script error." by default');
      assert.equal(Raven.options.some, 'config');
      assert.equal(Raven.project, 2);

      assert.isTrue(Raven.isSetup.calledOnce);
      assert.isFalse(TK.report.subscribe.calledOnce);
    });
  });

  describe('.config', function() {
    it('should work with a DSN', function() {
      assert.equal(Raven, Raven.config(SENTRY_DSN, {foo: 'bar'}), 'it should return Raven');
      assert.equal(Raven.key, 'abc');
      assert.equal(Raven.server, 'http://example.com:80/api/2/store/');
      assert.deepEqual(Raven.options.ignoreErrors, ['Script error.'], 'it should install "Script error." by default');
      assert.equal(Raven.options.foo, 'bar');
      assert.equal(Raven.project, 2);
    });

    it('should work with a protocol relative DSN', function() {
      Raven.config('//abc@example.com/2');
      assert.equal(Raven.key, 'abc');
      assert.equal(Raven.server, '//example.com/api/2/store/');
      assert.deepEqual(Raven.options.ignoreErrors, ['Script error.'], 'it should install "Script error." by default');
      assert.equal(Raven.project, 2);
    });

    describe('whitelistUrls', function() {
      it('should be false if none are passed', function() {
        Raven.config('//abc@example.com/2');
        assert.equal(Raven.options.whitelistUrls, false);
      });

      it('should join into a single RegExp', function() {
        Raven.config('//abc@example.com/2', {
          whitelistUrls: [
            /my.app/i,
            /other.app/i
          ]
        });

        assert.match(Raven.options.whitelistUrls, /my.app|other.app/i);
      });

      it('should handle strings as well', function() {
        Raven.config('//abc@example.com/2', {
          whitelistUrls: [
            /my.app/i,
            "stringy.app"
          ]
        });

        assert.match(Raven.options.whitelistUrls, /my.app|stringy.app/i);
      });
    });
  });

  describe('.install', function() {
    it('should check `isSetup`', function() {
      this.sinon.stub(Raven, 'isSetup').returns(false);
      this.sinon.stub(TK.report, 'subscribe');
      Raven.install();
      assert.isTrue(Raven.isSetup.calledOnce);
      assert.isFalse(TK.report.subscribe.calledOnce);
    });

    it('should register itself with TraceKit', function() {
      this.sinon.stub(Raven, 'isSetup').returns(true);
      this.sinon.stub(TK.report, 'subscribe');
      assert.equal(Raven, Raven.install());
      assert.isTrue(TK.report.subscribe.calledOnce);
      assert.equal(TK.report.subscribe.lastCall.args[0], Raven.handleStackInfo);
    });
  });

  describe('.wrap', function() {
    it('should return a wrapped callback', function() {
      var spy = this.sinon.spy();
      var wrapped = Raven.wrap(spy);
      assert.isFunction(wrapped);
      wrapped();
      assert.isTrue(spy.calledOnce);
    });
  });

  describe('.context', function() {
    it('should execute the callback with options', function() {
      var spy = this.sinon.spy();
      this.sinon.stub(Raven, 'captureException');
      Raven.context({'foo': 'bar'}, spy);
      assert.isTrue(spy.calledOnce);
      assert.isFalse(Raven.captureException.called);
    });

    it('should execute the callback with arguments', function() {
      var spy = this.sinon.spy();
      var args = [1, 2];
      Raven.context(spy, args);
      assert.deepEqual(spy.lastCall.args, args);
    });

    it('should execute the callback without options', function() {
      var spy = this.sinon.spy();
      this.sinon.stub(Raven, 'captureException');
      Raven.context(spy);
      assert.isTrue(spy.calledOnce);
      assert.isFalse(Raven.captureException.called);
    });

    it('should capture the exception with options', function() {
      var error = new Error('crap');
      var broken = function() { throw error; };
      this.sinon.stub(Raven, 'captureException');
      try {
        Raven.context({'foo': 'bar'}, broken);
      } catch(e) {
        assert.equal(e, error);
      }
      assert.isTrue(Raven.captureException.called);
      assert.deepEqual(Raven.captureException.lastCall.args, [error, {'foo': 'bar'}]);
    });

    it('should capture the exception without options', function() {
      var error = new Error('crap');
      var broken = function() { throw error; };
      this.sinon.stub(Raven, 'captureException');
      try {
        Raven.context(broken);
      } catch(e) {
        assert.equal(e, error);
      }
      assert.isTrue(Raven.captureException.called);
      assert.deepEqual(Raven.captureException.lastCall.args, [error, undefined]);
    });

    it('should execute the callback without arguments', function() {
      // This is only reproducable in a browser that complains about passing
      // undefined to Function.apply
      var spy = this.sinon.spy();
      Raven.context(spy);
      assert.deepEqual(spy.lastCall.args, []);
    });
  });

  describe('.uninstall', function() {
    it('should unsubscribe from TraceKit', function() {
      this.sinon.stub(TK.report, 'unsubscribe');
      Raven.uninstall();
      assert.isTrue(TK.report.unsubscribe.calledOnce);
      assert.equal(TK.report.unsubscribe.lastCall.args[0], Raven.handleStackInfo);
    });
  });

  describe('.setUser', function() {
    it('should set the user object', function() {
      Raven.setUser({name: 'Matt'});
      assert.deepEqual(Raven.user, {name: 'Matt'});
    });

    it('should clear the user with no arguments', function() {
      Raven.user = {name: 'Matt'};
      Raven.setUser();
      assert.isUndefined(Raven.user);
    });
  });

  describe('.captureMessage', function() {
    it('should work as advertised', function() {
      this.sinon.stub(Raven, 'send');
      Raven.captureMessage('lol', {foo: 'bar'});
      assert.deepEqual(Raven.send.lastCall.args, [{
        message: 'lol',
        foo: 'bar'
      }]);
    });

    it('should work as advertised #integration', function() {
      imageCache = [];
      setupRaven();
      Raven.captureMessage('lol', {foo: 'bar'});
      assert.equal(imageCache.length, 1);
      // It'd be hard to assert the actual payload being sent
      // since it includes the generated url, which is going to
      // vary between users running the tests
      // Unit tests should cover that the payload was constructed properly
    });
  });

  describe('.captureException', function() {
    it('should call TK.report', function() {
      var error = new Error('crap');
      this.sinon.stub(TK, 'report');
      Raven.captureException(error, {foo: 'bar'});
      assert.isTrue(TK.report.calledOnce);
      assert.deepEqual(TK.report.lastCall.args, [error, {foo: 'bar'}]);
    });

    it('shouldn\'t reraise the if the error is the same error', function() {
      var error = new Error('crap');
      this.sinon.stub(TK, 'report').throws(error);
      // this would raise if the errors didn't match
      Raven.captureException(error, {foo: 'bar'});
      assert.isTrue(TK.report.calledOnce);
    });

    it('should reraise a different error', function(done) {
      var error = new Error('crap1');
      this.sinon.stub(TK, 'report').throws(error);
      try {
        Raven.captureException(new Error('crap2'));
      } catch(e) {
        assert.equal(e, error);
        done();
      }
    });

    it('should capture as a normal message if a string is passed', function() {
      this.sinon.stub(Raven, 'captureMessage');
      this.sinon.stub(TK, 'report');
      Raven.captureException('derp');
      assert.equal(Raven.captureMessage.lastCall.args[0], 'derp');
      assert.isFalse(TK.report.called);
    });
  });
});
