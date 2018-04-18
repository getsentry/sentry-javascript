/*global XDomainRequest:false */

var TraceKit = require('../vendor/TraceKit/tracekit');
var stringify = require('../vendor/json-stringify-safe/stringify');
var md5 = require('../vendor/md5/md5');
var RavenConfigError = require('./configError');

var utils = require('./utils');
var isError = utils.isError;
var isObject = utils.isObject;
var isPlainObject = utils.isPlainObject;
var isErrorEvent = utils.isErrorEvent;
var isUndefined = utils.isUndefined;
var isFunction = utils.isFunction;
var isString = utils.isString;
var isArray = utils.isArray;
var isEmptyObject = utils.isEmptyObject;
var each = utils.each;
var objectMerge = utils.objectMerge;
var truncate = utils.truncate;
var objectFrozen = utils.objectFrozen;
var hasKey = utils.hasKey;
var joinRegExp = utils.joinRegExp;
var urlencode = utils.urlencode;
var uuid4 = utils.uuid4;
var htmlTreeAsString = utils.htmlTreeAsString;
var isSameException = utils.isSameException;
var isSameStacktrace = utils.isSameStacktrace;
var parseUrl = utils.parseUrl;
var fill = utils.fill;
var supportsFetch = utils.supportsFetch;
var supportsReferrerPolicy = utils.supportsReferrerPolicy;
var serializeKeysForMessage = utils.serializeKeysForMessage;
var serializeException = utils.serializeException;
var sanitize = utils.sanitize;

var wrapConsoleMethod = require('./console').wrapMethod;

var dsnKeys = 'source protocol user pass host port path'.split(' '),
  dsnPattern = /^(?:(\w+):)?\/\/(?:(\w+)(:\w+)?@)?([\w\.-]+)(?::(\d+))?(\/.*)/;

function now() {
  return +new Date();
}

// This is to be defensive in environments where window does not exist (see https://github.com/getsentry/raven-js/pull/785)
var _window =
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};
var _document = _window.document;
var _navigator = _window.navigator;

function keepOriginalCallback(original, callback) {
  return isFunction(callback)
    ? function(data) {
        return callback(data, original);
      }
    : callback;
}

// First, check for JSON support
// If there is no JSON, we no-op the core features of Raven
// since JSON is required to encode the payload
function Raven() {
  this._hasJSON = !!(typeof JSON === 'object' && JSON.stringify);
  // Raven can run in contexts where there's no document (react-native)
  this._hasDocument = !isUndefined(_document);
  this._hasNavigator = !isUndefined(_navigator);
  this._lastCapturedException = null;
  this._lastData = null;
  this._lastEventId = null;
  this._globalServer = null;
  this._globalKey = null;
  this._globalProject = null;
  this._globalContext = {};
  this._globalOptions = {
    // SENTRY_RELEASE can be injected by https://github.com/getsentry/sentry-webpack-plugin
    release: _window.SENTRY_RELEASE && _window.SENTRY_RELEASE.id,
    logger: 'javascript',
    ignoreErrors: [],
    ignoreUrls: [],
    whitelistUrls: [],
    includePaths: [],
    headers: null,
    collectWindowErrors: true,
    captureUnhandledRejections: true,
    maxMessageLength: 0,
    // By default, truncates URL values to 250 chars
    maxUrlLength: 250,
    stackTraceLimit: 50,
    autoBreadcrumbs: true,
    instrument: true,
    sampleRate: 1,
    sanitizeKeys: []
  };
  this._fetchDefaults = {
    method: 'POST',
    keepalive: true,
    // Despite all stars in the sky saying that Edge supports old draft syntax, aka 'never', 'always', 'origin' and 'default
    // https://caniuse.com/#feat=referrer-policy
    // It doesn't. And it throw exception instead of ignoring this parameter...
    // REF: https://github.com/getsentry/raven-js/issues/1233
    referrerPolicy: supportsReferrerPolicy() ? 'origin' : ''
  };
  this._ignoreOnError = 0;
  this._isRavenInstalled = false;
  this._originalErrorStackTraceLimit = Error.stackTraceLimit;
  // capture references to window.console *and* all its methods first
  // before the console plugin has a chance to monkey patch
  this._originalConsole = _window.console || {};
  this._originalConsoleMethods = {};
  this._plugins = [];
  this._startTime = now();
  this._wrappedBuiltIns = [];
  this._breadcrumbs = [];
  this._lastCapturedEvent = null;
  this._keypressTimeout;
  this._location = _window.location;
  this._lastHref = this._location && this._location.href;
  this._resetBackoff();

  // eslint-disable-next-line guard-for-in
  for (var method in this._originalConsole) {
    this._originalConsoleMethods[method] = this._originalConsole[method];
  }
}

/*
 * The core Raven singleton
 *
 * @this {Raven}
 */

Raven.prototype = {
  // Hardcode version string so that raven source can be loaded directly via
  // webpack (using a build step causes webpack #1617). Grunt verifies that
  // this value matches package.json during build.
  //   See: https://github.com/getsentry/raven-js/issues/465
  VERSION: '3.24.2',

  debug: false,

  TraceKit: TraceKit, // alias to TraceKit

  /*
     * Configure Raven with a DSN and extra options
     *
     * @param {string} dsn The public Sentry DSN
     * @param {object} options Set of global options [optional]
     * @return {Raven}
     */
  config: function(dsn, options) {
    var self = this;

    if (self._globalServer) {
      this._logDebug('error', 'Error: Raven has already been configured');
      return self;
    }
    if (!dsn) return self;

    var globalOptions = self._globalOptions;

    // merge in options
    if (options) {
      each(options, function(key, value) {
        // tags and extra are special and need to be put into context
        if (key === 'tags' || key === 'extra' || key === 'user') {
          self._globalContext[key] = value;
        } else {
          globalOptions[key] = value;
        }
      });
    }

    self.setDSN(dsn);

    // "Script error." is hard coded into browsers for errors that it can't read.
    // this is the result of a script being pulled in from an external domain and CORS.
    globalOptions.ignoreErrors.push(/^Script error\.?$/);
    globalOptions.ignoreErrors.push(/^Javascript error: Script error\.? on line 0$/);

    // join regexp rules into one big rule
    globalOptions.ignoreErrors = joinRegExp(globalOptions.ignoreErrors);
    globalOptions.ignoreUrls = globalOptions.ignoreUrls.length
      ? joinRegExp(globalOptions.ignoreUrls)
      : false;
    globalOptions.whitelistUrls = globalOptions.whitelistUrls.length
      ? joinRegExp(globalOptions.whitelistUrls)
      : false;
    globalOptions.includePaths = joinRegExp(globalOptions.includePaths);
    globalOptions.maxBreadcrumbs = Math.max(
      0,
      Math.min(globalOptions.maxBreadcrumbs || 100, 100)
    ); // default and hard limit is 100

    var autoBreadcrumbDefaults = {
      xhr: true,
      console: true,
      dom: true,
      location: true,
      sentry: true
    };

    var autoBreadcrumbs = globalOptions.autoBreadcrumbs;
    if ({}.toString.call(autoBreadcrumbs) === '[object Object]') {
      autoBreadcrumbs = objectMerge(autoBreadcrumbDefaults, autoBreadcrumbs);
    } else if (autoBreadcrumbs !== false) {
      autoBreadcrumbs = autoBreadcrumbDefaults;
    }
    globalOptions.autoBreadcrumbs = autoBreadcrumbs;

    var instrumentDefaults = {
      tryCatch: true
    };

    var instrument = globalOptions.instrument;
    if ({}.toString.call(instrument) === '[object Object]') {
      instrument = objectMerge(instrumentDefaults, instrument);
    } else if (instrument !== false) {
      instrument = instrumentDefaults;
    }
    globalOptions.instrument = instrument;

    TraceKit.collectWindowErrors = !!globalOptions.collectWindowErrors;

    // return for chaining
    return self;
  },

  /*
     * Installs a global window.onerror error handler
     * to capture and report uncaught exceptions.
     * At this point, install() is required to be called due
     * to the way TraceKit is set up.
     *
     * @return {Raven}
     */
  install: function() {
    var self = this;
    if (self.isSetup() && !self._isRavenInstalled) {
      TraceKit.report.subscribe(function() {
        self._handleOnErrorStackInfo.apply(self, arguments);
      });

      if (self._globalOptions.captureUnhandledRejections) {
        self._attachPromiseRejectionHandler();
      }

      self._patchFunctionToString();

      if (self._globalOptions.instrument && self._globalOptions.instrument.tryCatch) {
        self._instrumentTryCatch();
      }

      if (self._globalOptions.autoBreadcrumbs) self._instrumentBreadcrumbs();

      // Install all of the plugins
      self._drainPlugins();

      self._isRavenInstalled = true;
    }

    Error.stackTraceLimit = self._globalOptions.stackTraceLimit;
    return this;
  },

  /*
     * Set the DSN (can be called multiple time unlike config)
     *
     * @param {string} dsn The public Sentry DSN
     */
  setDSN: function(dsn) {
    var self = this,
      uri = self._parseDSN(dsn),
      lastSlash = uri.path.lastIndexOf('/'),
      path = uri.path.substr(1, lastSlash);

    self._dsn = dsn;
    self._globalKey = uri.user;
    self._globalSecret = uri.pass && uri.pass.substr(1);
    self._globalProject = uri.path.substr(lastSlash + 1);

    self._globalServer = self._getGlobalServer(uri);

    self._globalEndpoint =
      self._globalServer + '/' + path + 'api/' + self._globalProject + '/store/';

    // Reset backoff state since we may be pointing at a
    // new project/server
    this._resetBackoff();
  },

  /*
     * Wrap code within a context so Raven can capture errors
     * reliably across domains that is executed immediately.
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The callback to be immediately executed within the context
     * @param {array} args An array of arguments to be called with the callback [optional]
     */
  context: function(options, func, args) {
    if (isFunction(options)) {
      args = func || [];
      func = options;
      options = undefined;
    }

    return this.wrap(options, func).apply(this, args);
  },

  /*
     * Wrap code within a context and returns back a new function to be executed
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The function to be wrapped in a new context
     * @param {function} func A function to call before the try/catch wrapper [optional, private]
     * @return {function} The newly wrapped functions with a context
     */
  wrap: function(options, func, _before) {
    var self = this;
    // 1 argument has been passed, and it's not a function
    // so just return it
    if (isUndefined(func) && !isFunction(options)) {
      return options;
    }

    // options is optional
    if (isFunction(options)) {
      func = options;
      options = undefined;
    }

    // At this point, we've passed along 2 arguments, and the second one
    // is not a function either, so we'll just return the second argument.
    if (!isFunction(func)) {
      return func;
    }

    // We don't wanna wrap it twice!
    try {
      if (func.__raven__) {
        return func;
      }

      // If this has already been wrapped in the past, return that
      if (func.__raven_wrapper__) {
        return func.__raven_wrapper__;
      }
    } catch (e) {
      // Just accessing custom props in some Selenium environments
      // can cause a "Permission denied" exception (see raven-js#495).
      // Bail on wrapping and return the function as-is (defers to window.onerror).
      return func;
    }

    function wrapped() {
      var args = [],
        i = arguments.length,
        deep = !options || (options && options.deep !== false);

      if (_before && isFunction(_before)) {
        _before.apply(this, arguments);
      }

      // Recursively wrap all of a function's arguments that are
      // functions themselves.
      while (i--) args[i] = deep ? self.wrap(options, arguments[i]) : arguments[i];

      try {
        // Attempt to invoke user-land function
        // NOTE: If you are a Sentry user, and you are seeing this stack frame, it
        //       means Raven caught an error invoking your application code. This is
        //       expected behavior and NOT indicative of a bug with Raven.js.
        return func.apply(this, args);
      } catch (e) {
        self._ignoreNextOnError();
        self.captureException(e, options);
        throw e;
      }
    }

    // copy over properties of the old function
    for (var property in func) {
      if (hasKey(func, property)) {
        wrapped[property] = func[property];
      }
    }
    wrapped.prototype = func.prototype;

    func.__raven_wrapper__ = wrapped;
    // Signal that this function has been wrapped/filled already
    // for both debugging and to prevent it to being wrapped/filled twice
    wrapped.__raven__ = true;
    wrapped.__orig__ = func;

    return wrapped;
  },

  /**
   * Uninstalls the global error handler.
   *
   * @return {Raven}
   */
  uninstall: function() {
    TraceKit.report.uninstall();

    this._detachPromiseRejectionHandler();
    this._unpatchFunctionToString();
    this._restoreBuiltIns();
    this._restoreConsole();

    Error.stackTraceLimit = this._originalErrorStackTraceLimit;
    this._isRavenInstalled = false;

    return this;
  },

  /**
   * Callback used for `unhandledrejection` event
   *
   * @param {PromiseRejectionEvent} event An object containing
   *   promise: the Promise that was rejected
   *   reason: the value with which the Promise was rejected
   * @return void
   */
  _promiseRejectionHandler: function(event) {
    this._logDebug('debug', 'Raven caught unhandled promise rejection:', event);
    this.captureException(event.reason, {
      extra: {
        unhandledPromiseRejection: true
      }
    });
  },

  /**
   * Installs the global promise rejection handler.
   *
   * @return {raven}
   */
  _attachPromiseRejectionHandler: function() {
    this._promiseRejectionHandler = this._promiseRejectionHandler.bind(this);
    _window.addEventListener &&
      _window.addEventListener('unhandledrejection', this._promiseRejectionHandler);
    return this;
  },

  /**
   * Uninstalls the global promise rejection handler.
   *
   * @return {raven}
   */
  _detachPromiseRejectionHandler: function() {
    _window.removeEventListener &&
      _window.removeEventListener('unhandledrejection', this._promiseRejectionHandler);
    return this;
  },

  /**
   * Manually capture an exception and send it over to Sentry
   *
   * @param {error} ex An exception to be logged
   * @param {object} options A specific set of options for this error [optional]
   * @return {Raven}
   */
  captureException: function(ex, options) {
    options = objectMerge({trimHeadFrames: 0}, options ? options : {});

    if (isErrorEvent(ex) && ex.error) {
      // If it is an ErrorEvent with `error` property, extract it to get actual Error
      ex = ex.error;
    } else if (isError(ex)) {
      // we have a real Error object
      ex = ex;
    } else if (isPlainObject(ex)) {
      // If it is plain Object, serialize it manually and extract options
      // This will allow us to group events based on top-level keys
      // which is much better than creating new group when any key/value change
      options = this._getCaptureExceptionOptionsFromPlainObject(options, ex);
      ex = new Error(options.message);
    } else {
      // If none of previous checks were valid, then it means that
      // it's not a plain Object
      // it's not a valid ErrorEvent (one with an error property)
      // it's not an Error
      // So bail out and capture it as a simple message:
      return this.captureMessage(
        ex,
        objectMerge(options, {
          stacktrace: true, // if we fall back to captureMessage, default to attempting a new trace
          trimHeadFrames: options.trimHeadFrames + 1
        })
      );
    }

    // Store the raw exception object for potential debugging and introspection
    this._lastCapturedException = ex;

    // TraceKit.report will re-raise any exception passed to it,
    // which means you have to wrap it in try/catch. Instead, we
    // can wrap it here and only re-raise if TraceKit.report
    // raises an exception different from the one we asked to
    // report on.
    try {
      var stack = TraceKit.computeStackTrace(ex);
      this._handleStackInfo(stack, options);
    } catch (ex1) {
      if (ex !== ex1) {
        throw ex1;
      }
    }

    return this;
  },

  _getCaptureExceptionOptionsFromPlainObject: function(currentOptions, ex) {
    var exKeys = Object.keys(ex).sort();
    var options = objectMerge(currentOptions, {
      message:
        'Non-Error exception captured with keys: ' + serializeKeysForMessage(exKeys),
      fingerprint: [md5(exKeys)],
      extra: currentOptions.extra || {}
    });
    options.extra.__serialized__ = serializeException(ex);

    return options;
  },

  /*
     * Manually send a message to Sentry
     *
     * @param {string} msg A plain message to be captured in Sentry
     * @param {object} options A specific set of options for this message [optional]
     * @return {Raven}
     */
  captureMessage: function(msg, options) {
    // config() automagically converts ignoreErrors from a list to a RegExp so we need to test for an
    // early call; we'll error on the side of logging anything called before configuration since it's
    // probably something you should see:
    if (
      !!this._globalOptions.ignoreErrors.test &&
      this._globalOptions.ignoreErrors.test(msg)
    ) {
      return;
    }

    options = options || {};
    msg = msg + ''; // Make sure it's actually a string

    var data = objectMerge(
      {
        message: msg
      },
      options
    );

    var ex;
    // Generate a "synthetic" stack trace from this point.
    // NOTE: If you are a Sentry user, and you are seeing this stack frame, it is NOT indicative
    //       of a bug with Raven.js. Sentry generates synthetic traces either by configuration,
    //       or if it catches a thrown object without a "stack" property.
    try {
      throw new Error(msg);
    } catch (ex1) {
      ex = ex1;
    }

    // null exception name so `Error` isn't prefixed to msg
    ex.name = null;
    var stack = TraceKit.computeStackTrace(ex);

    // stack[0] is `throw new Error(msg)` call itself, we are interested in the frame that was just before that, stack[1]
    var initialCall = isArray(stack.stack) && stack.stack[1];

    // if stack[1] is `Raven.captureException`, it means that someone passed a string to it and we redirected that call
    // to be handled by `captureMessage`, thus `initialCall` is the 3rd one, not 2nd
    // initialCall => captureException(string) => captureMessage(string)
    if (initialCall && initialCall.func === 'Raven.captureException') {
      initialCall = stack.stack[2];
    }

    var fileurl = (initialCall && initialCall.url) || '';

    if (
      !!this._globalOptions.ignoreUrls.test &&
      this._globalOptions.ignoreUrls.test(fileurl)
    ) {
      return;
    }

    if (
      !!this._globalOptions.whitelistUrls.test &&
      !this._globalOptions.whitelistUrls.test(fileurl)
    ) {
      return;
    }

    if (this._globalOptions.stacktrace || (options && options.stacktrace)) {
      // fingerprint on msg, not stack trace (legacy behavior, could be revisited)
      data.fingerprint = data.fingerprint == null ? msg : data.fingerprint;

      options = objectMerge(
        {
          trimHeadFrames: 0
        },
        options
      );
      // Since we know this is a synthetic trace, the top frame (this function call)
      // MUST be from Raven.js, so mark it for trimming
      // We add to the trim counter so that callers can choose to trim extra frames, such
      // as utility functions.
      options.trimHeadFrames += 1;

      var frames = this._prepareFrames(stack, options);
      data.stacktrace = {
        // Sentry expects frames oldest to newest
        frames: frames.reverse()
      };
    }

    // Make sure that fingerprint is always wrapped in an array
    if (data.fingerprint) {
      data.fingerprint = isArray(data.fingerprint)
        ? data.fingerprint
        : [data.fingerprint];
    }

    // Fire away!
    this._send(data);

    return this;
  },

  captureBreadcrumb: function(obj) {
    var crumb = objectMerge(
      {
        timestamp: now() / 1000
      },
      obj
    );

    if (isFunction(this._globalOptions.breadcrumbCallback)) {
      var result = this._globalOptions.breadcrumbCallback(crumb);

      if (isObject(result) && !isEmptyObject(result)) {
        crumb = result;
      } else if (result === false) {
        return this;
      }
    }

    this._breadcrumbs.push(crumb);
    if (this._breadcrumbs.length > this._globalOptions.maxBreadcrumbs) {
      this._breadcrumbs.shift();
    }
    return this;
  },

  addPlugin: function(plugin /*arg1, arg2, ... argN*/) {
    var pluginArgs = [].slice.call(arguments, 1);

    this._plugins.push([plugin, pluginArgs]);
    if (this._isRavenInstalled) {
      this._drainPlugins();
    }

    return this;
  },

  /*
     * Set/clear a user to be sent along with the payload.
     *
     * @param {object} user An object representing user data [optional]
     * @return {Raven}
     */
  setUserContext: function(user) {
    // Intentionally do not merge here since that's an unexpected behavior.
    this._globalContext.user = user;

    return this;
  },

  /*
     * Merge extra attributes to be sent along with the payload.
     *
     * @param {object} extra An object representing extra data [optional]
     * @return {Raven}
     */
  setExtraContext: function(extra) {
    this._mergeContext('extra', extra);

    return this;
  },

  /*
     * Merge tags to be sent along with the payload.
     *
     * @param {object} tags An object representing tags [optional]
     * @return {Raven}
     */
  setTagsContext: function(tags) {
    this._mergeContext('tags', tags);

    return this;
  },

  /*
     * Clear all of the context.
     *
     * @return {Raven}
     */
  clearContext: function() {
    this._globalContext = {};

    return this;
  },

  /*
     * Get a copy of the current context. This cannot be mutated.
     *
     * @return {object} copy of context
     */
  getContext: function() {
    // lol javascript
    return JSON.parse(stringify(this._globalContext));
  },

  /*
     * Set environment of application
     *
     * @param {string} environment Typically something like 'production'.
     * @return {Raven}
     */
  setEnvironment: function(environment) {
    this._globalOptions.environment = environment;

    return this;
  },

  /*
     * Set release version of application
     *
     * @param {string} release Typically something like a git SHA to identify version
     * @return {Raven}
     */
  setRelease: function(release) {
    this._globalOptions.release = release;

    return this;
  },

  /*
     * Set the dataCallback option
     *
     * @param {function} callback The callback to run which allows the
     *                            data blob to be mutated before sending
     * @return {Raven}
     */
  setDataCallback: function(callback) {
    var original = this._globalOptions.dataCallback;
    this._globalOptions.dataCallback = keepOriginalCallback(original, callback);
    return this;
  },

  /*
     * Set the breadcrumbCallback option
     *
     * @param {function} callback The callback to run which allows filtering
     *                            or mutating breadcrumbs
     * @return {Raven}
     */
  setBreadcrumbCallback: function(callback) {
    var original = this._globalOptions.breadcrumbCallback;
    this._globalOptions.breadcrumbCallback = keepOriginalCallback(original, callback);
    return this;
  },

  /*
     * Set the shouldSendCallback option
     *
     * @param {function} callback The callback to run which allows
     *                            introspecting the blob before sending
     * @return {Raven}
     */
  setShouldSendCallback: function(callback) {
    var original = this._globalOptions.shouldSendCallback;
    this._globalOptions.shouldSendCallback = keepOriginalCallback(original, callback);
    return this;
  },

  /**
   * Override the default HTTP transport mechanism that transmits data
   * to the Sentry server.
   *
   * @param {function} transport Function invoked instead of the default
   *                             `makeRequest` handler.
   *
   * @return {Raven}
   */
  setTransport: function(transport) {
    this._globalOptions.transport = transport;

    return this;
  },

  /*
     * Get the latest raw exception that was captured by Raven.
     *
     * @return {error}
     */
  lastException: function() {
    return this._lastCapturedException;
  },

  /*
     * Get the last event id
     *
     * @return {string}
     */
  lastEventId: function() {
    return this._lastEventId;
  },

  /*
     * Determine if Raven is setup and ready to go.
     *
     * @return {boolean}
     */
  isSetup: function() {
    if (!this._hasJSON) return false; // needs JSON support
    if (!this._globalServer) {
      if (!this.ravenNotConfiguredError) {
        this.ravenNotConfiguredError = true;
        this._logDebug('error', 'Error: Raven has not been configured.');
      }
      return false;
    }
    return true;
  },

  afterLoad: function() {
    // TODO: remove window dependence?

    // Attempt to initialize Raven on load
    var RavenConfig = _window.RavenConfig;
    if (RavenConfig) {
      this.config(RavenConfig.dsn, RavenConfig.config).install();
    }
  },

  showReportDialog: function(options) {
    if (
      !_document // doesn't work without a document (React native)
    )
      return;

    options = options || {};

    var lastEventId = options.eventId || this.lastEventId();
    if (!lastEventId) {
      throw new RavenConfigError('Missing eventId');
    }

    var dsn = options.dsn || this._dsn;
    if (!dsn) {
      throw new RavenConfigError('Missing DSN');
    }

    var encode = encodeURIComponent;
    var qs = '';
    qs += '?eventId=' + encode(lastEventId);
    qs += '&dsn=' + encode(dsn);

    var user = options.user || this._globalContext.user;
    if (user) {
      if (user.name) qs += '&name=' + encode(user.name);
      if (user.email) qs += '&email=' + encode(user.email);
    }

    var globalServer = this._getGlobalServer(this._parseDSN(dsn));

    var script = _document.createElement('script');
    script.async = true;
    script.src = globalServer + '/api/embed/error-page/' + qs;
    (_document.head || _document.body).appendChild(script);
  },

  /**** Private functions ****/
  _ignoreNextOnError: function() {
    var self = this;
    this._ignoreOnError += 1;
    setTimeout(function() {
      // onerror should trigger before setTimeout
      self._ignoreOnError -= 1;
    });
  },

  _triggerEvent: function(eventType, options) {
    // NOTE: `event` is a native browser thing, so let's avoid conflicting wiht it
    var evt, key;

    if (!this._hasDocument) return;

    options = options || {};

    eventType = 'raven' + eventType.substr(0, 1).toUpperCase() + eventType.substr(1);

    if (_document.createEvent) {
      evt = _document.createEvent('HTMLEvents');
      evt.initEvent(eventType, true, true);
    } else {
      evt = _document.createEventObject();
      evt.eventType = eventType;
    }

    for (key in options)
      if (hasKey(options, key)) {
        evt[key] = options[key];
      }

    if (_document.createEvent) {
      // IE9 if standards
      _document.dispatchEvent(evt);
    } else {
      // IE8 regardless of Quirks or Standards
      // IE9 if quirks
      try {
        _document.fireEvent('on' + evt.eventType.toLowerCase(), evt);
      } catch (e) {
        // Do nothing
      }
    }
  },

  /**
   * Wraps addEventListener to capture UI breadcrumbs
   * @param evtName the event name (e.g. "click")
   * @returns {Function}
   * @private
   */
  _breadcrumbEventHandler: function(evtName) {
    var self = this;
    return function(evt) {
      // reset keypress timeout; e.g. triggering a 'click' after
      // a 'keypress' will reset the keypress debounce so that a new
      // set of keypresses can be recorded
      self._keypressTimeout = null;

      // It's possible this handler might trigger multiple times for the same
      // event (e.g. event propagation through node ancestors). Ignore if we've
      // already captured the event.
      if (self._lastCapturedEvent === evt) return;

      self._lastCapturedEvent = evt;

      // try/catch both:
      // - accessing evt.target (see getsentry/raven-js#838, #768)
      // - `htmlTreeAsString` because it's complex, and just accessing the DOM incorrectly
      //   can throw an exception in some circumstances.
      var target;
      try {
        target = htmlTreeAsString(evt.target);
      } catch (e) {
        target = '<unknown>';
      }

      self.captureBreadcrumb({
        category: 'ui.' + evtName, // e.g. ui.click, ui.input
        message: target
      });
    };
  },

  /**
   * Wraps addEventListener to capture keypress UI events
   * @returns {Function}
   * @private
   */
  _keypressEventHandler: function() {
    var self = this,
      debounceDuration = 1000; // milliseconds

    // TODO: if somehow user switches keypress target before
    //       debounce timeout is triggered, we will only capture
    //       a single breadcrumb from the FIRST target (acceptable?)
    return function(evt) {
      var target;
      try {
        target = evt.target;
      } catch (e) {
        // just accessing event properties can throw an exception in some rare circumstances
        // see: https://github.com/getsentry/raven-js/issues/838
        return;
      }
      var tagName = target && target.tagName;

      // only consider keypress events on actual input elements
      // this will disregard keypresses targeting body (e.g. tabbing
      // through elements, hotkeys, etc)
      if (
        !tagName ||
        (tagName !== 'INPUT' && tagName !== 'TEXTAREA' && !target.isContentEditable)
      )
        return;

      // record first keypress in a series, but ignore subsequent
      // keypresses until debounce clears
      var timeout = self._keypressTimeout;
      if (!timeout) {
        self._breadcrumbEventHandler('input')(evt);
      }
      clearTimeout(timeout);
      self._keypressTimeout = setTimeout(function() {
        self._keypressTimeout = null;
      }, debounceDuration);
    };
  },

  /**
   * Captures a breadcrumb of type "navigation", normalizing input URLs
   * @param to the originating URL
   * @param from the target URL
   * @private
   */
  _captureUrlChange: function(from, to) {
    var parsedLoc = parseUrl(this._location.href);
    var parsedTo = parseUrl(to);
    var parsedFrom = parseUrl(from);

    // because onpopstate only tells you the "new" (to) value of location.href, and
    // not the previous (from) value, we need to track the value of the current URL
    // state ourselves
    this._lastHref = to;

    // Use only the path component of the URL if the URL matches the current
    // document (almost all the time when using pushState)
    if (parsedLoc.protocol === parsedTo.protocol && parsedLoc.host === parsedTo.host)
      to = parsedTo.relative;
    if (parsedLoc.protocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host)
      from = parsedFrom.relative;

    this.captureBreadcrumb({
      category: 'navigation',
      data: {
        to: to,
        from: from
      }
    });
  },

  _patchFunctionToString: function() {
    var self = this;
    self._originalFunctionToString = Function.prototype.toString;
    // eslint-disable-next-line no-extend-native
    Function.prototype.toString = function() {
      if (typeof this === 'function' && this.__raven__) {
        return self._originalFunctionToString.apply(this.__orig__, arguments);
      }
      return self._originalFunctionToString.apply(this, arguments);
    };
  },

  _unpatchFunctionToString: function() {
    if (this._originalFunctionToString) {
      // eslint-disable-next-line no-extend-native
      Function.prototype.toString = this._originalFunctionToString;
    }
  },

  /**
   * Wrap timer functions and event targets to catch errors and provide
   * better metadata.
   */
  _instrumentTryCatch: function() {
    var self = this;

    var wrappedBuiltIns = self._wrappedBuiltIns;

    function wrapTimeFn(orig) {
      return function(fn, t) {
        // preserve arity
        // Make a copy of the arguments to prevent deoptimization
        // https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#32-leaking-arguments
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i) {
          args[i] = arguments[i];
        }
        var originalCallback = args[0];
        if (isFunction(originalCallback)) {
          args[0] = self.wrap(originalCallback);
        }

        // IE < 9 doesn't support .call/.apply on setInterval/setTimeout, but it
        // also supports only two arguments and doesn't care what this is, so we
        // can just call the original function directly.
        if (orig.apply) {
          return orig.apply(this, args);
        } else {
          return orig(args[0], args[1]);
        }
      };
    }

    var autoBreadcrumbs = this._globalOptions.autoBreadcrumbs;

    function wrapEventTarget(global) {
      var proto = _window[global] && _window[global].prototype;
      if (proto && proto.hasOwnProperty && proto.hasOwnProperty('addEventListener')) {
        fill(
          proto,
          'addEventListener',
          function(orig) {
            return function(evtName, fn, capture, secure) {
              // preserve arity
              try {
                if (fn && fn.handleEvent) {
                  fn.handleEvent = self.wrap(fn.handleEvent);
                }
              } catch (err) {
                // can sometimes get 'Permission denied to access property "handle Event'
              }

              // More breadcrumb DOM capture ... done here and not in `_instrumentBreadcrumbs`
              // so that we don't have more than one wrapper function
              var before, clickHandler, keypressHandler;

              if (
                autoBreadcrumbs &&
                autoBreadcrumbs.dom &&
                (global === 'EventTarget' || global === 'Node')
              ) {
                // NOTE: generating multiple handlers per addEventListener invocation, should
                //       revisit and verify we can just use one (almost certainly)
                clickHandler = self._breadcrumbEventHandler('click');
                keypressHandler = self._keypressEventHandler();
                before = function(evt) {
                  // need to intercept every DOM event in `before` argument, in case that
                  // same wrapped method is re-used for different events (e.g. mousemove THEN click)
                  // see #724
                  if (!evt) return;

                  var eventType;
                  try {
                    eventType = evt.type;
                  } catch (e) {
                    // just accessing event properties can throw an exception in some rare circumstances
                    // see: https://github.com/getsentry/raven-js/issues/838
                    return;
                  }
                  if (eventType === 'click') return clickHandler(evt);
                  else if (eventType === 'keypress') return keypressHandler(evt);
                };
              }
              return orig.call(
                this,
                evtName,
                self.wrap(fn, undefined, before),
                capture,
                secure
              );
            };
          },
          wrappedBuiltIns
        );
        fill(
          proto,
          'removeEventListener',
          function(orig) {
            return function(evt, fn, capture, secure) {
              try {
                fn = fn && (fn.__raven_wrapper__ ? fn.__raven_wrapper__ : fn);
              } catch (e) {
                // ignore, accessing __raven_wrapper__ will throw in some Selenium environments
              }
              return orig.call(this, evt, fn, capture, secure);
            };
          },
          wrappedBuiltIns
        );
      }
    }

    fill(_window, 'setTimeout', wrapTimeFn, wrappedBuiltIns);
    fill(_window, 'setInterval', wrapTimeFn, wrappedBuiltIns);
    if (_window.requestAnimationFrame) {
      fill(
        _window,
        'requestAnimationFrame',
        function(orig) {
          return function(cb) {
            return orig(self.wrap(cb));
          };
        },
        wrappedBuiltIns
      );
    }

    // event targets borrowed from bugsnag-js:
    // https://github.com/bugsnag/bugsnag-js/blob/master/src/bugsnag.js#L666
    var eventTargets = [
      'EventTarget',
      'Window',
      'Node',
      'ApplicationCache',
      'AudioTrackList',
      'ChannelMergerNode',
      'CryptoOperation',
      'EventSource',
      'FileReader',
      'HTMLUnknownElement',
      'IDBDatabase',
      'IDBRequest',
      'IDBTransaction',
      'KeyOperation',
      'MediaController',
      'MessagePort',
      'ModalWindow',
      'Notification',
      'SVGElementInstance',
      'Screen',
      'TextTrack',
      'TextTrackCue',
      'TextTrackList',
      'WebSocket',
      'WebSocketWorker',
      'Worker',
      'XMLHttpRequest',
      'XMLHttpRequestEventTarget',
      'XMLHttpRequestUpload'
    ];
    for (var i = 0; i < eventTargets.length; i++) {
      wrapEventTarget(eventTargets[i]);
    }
  },

  /**
   * Instrument browser built-ins w/ breadcrumb capturing
   *  - XMLHttpRequests
   *  - DOM interactions (click/typing)
   *  - window.location changes
   *  - console
   *
   * Can be disabled or individually configured via the `autoBreadcrumbs` config option
   */
  _instrumentBreadcrumbs: function() {
    var self = this;
    var autoBreadcrumbs = this._globalOptions.autoBreadcrumbs;

    var wrappedBuiltIns = self._wrappedBuiltIns;

    function wrapProp(prop, xhr) {
      if (prop in xhr && isFunction(xhr[prop])) {
        fill(xhr, prop, function(orig) {
          return self.wrap(orig);
        }); // intentionally don't track filled methods on XHR instances
      }
    }

    if (autoBreadcrumbs.xhr && 'XMLHttpRequest' in _window) {
      var xhrproto = _window.XMLHttpRequest && _window.XMLHttpRequest.prototype;
      fill(
        xhrproto,
        'open',
        function(origOpen) {
          return function(method, url) {
            // preserve arity

            // if Sentry key appears in URL, don't capture
            if (isString(url) && url.indexOf(self._globalKey) === -1) {
              this.__raven_xhr = {
                method: method,
                url: url,
                status_code: null
              };
            }

            return origOpen.apply(this, arguments);
          };
        },
        wrappedBuiltIns
      );

      fill(
        xhrproto,
        'send',
        function(origSend) {
          return function() {
            // preserve arity
            var xhr = this;

            function onreadystatechangeHandler() {
              if (xhr.__raven_xhr && xhr.readyState === 4) {
                try {
                  // touching statusCode in some platforms throws
                  // an exception
                  xhr.__raven_xhr.status_code = xhr.status;
                } catch (e) {
                  /* do nothing */
                }

                self.captureBreadcrumb({
                  type: 'http',
                  category: 'xhr',
                  data: xhr.__raven_xhr
                });
              }
            }

            var props = ['onload', 'onerror', 'onprogress'];
            for (var j = 0; j < props.length; j++) {
              wrapProp(props[j], xhr);
            }

            if ('onreadystatechange' in xhr && isFunction(xhr.onreadystatechange)) {
              fill(
                xhr,
                'onreadystatechange',
                function(orig) {
                  return self.wrap(orig, undefined, onreadystatechangeHandler);
                } /* intentionally don't track this instrumentation */
              );
            } else {
              // if onreadystatechange wasn't actually set by the page on this xhr, we
              // are free to set our own and capture the breadcrumb
              xhr.onreadystatechange = onreadystatechangeHandler;
            }

            return origSend.apply(this, arguments);
          };
        },
        wrappedBuiltIns
      );
    }

    if (autoBreadcrumbs.xhr && supportsFetch()) {
      fill(
        _window,
        'fetch',
        function(origFetch) {
          return function() {
            // preserve arity
            // Make a copy of the arguments to prevent deoptimization
            // https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#32-leaking-arguments
            var args = new Array(arguments.length);
            for (var i = 0; i < args.length; ++i) {
              args[i] = arguments[i];
            }

            var fetchInput = args[0];
            var method = 'GET';
            var url;

            if (typeof fetchInput === 'string') {
              url = fetchInput;
            } else if ('Request' in _window && fetchInput instanceof _window.Request) {
              url = fetchInput.url;
              if (fetchInput.method) {
                method = fetchInput.method;
              }
            } else {
              url = '' + fetchInput;
            }

            // if Sentry key appears in URL, don't capture, as it's our own request
            if (url.indexOf(self._globalKey) !== -1) {
              return origFetch.apply(this, args);
            }

            if (args[1] && args[1].method) {
              method = args[1].method;
            }

            var fetchData = {
              method: method,
              url: url,
              status_code: null
            };

            return origFetch
              .apply(this, args)
              .then(function(response) {
                fetchData.status_code = response.status;

                self.captureBreadcrumb({
                  type: 'http',
                  category: 'fetch',
                  data: fetchData
                });

                return response;
              })
              ['catch'](function(err) {
                // if there is an error performing the request
                self.captureBreadcrumb({
                  type: 'http',
                  category: 'fetch',
                  data: fetchData,
                  level: 'error'
                });

                throw err;
              });
          };
        },
        wrappedBuiltIns
      );
    }

    // Capture breadcrumbs from any click that is unhandled / bubbled up all the way
    // to the document. Do this before we instrument addEventListener.
    if (autoBreadcrumbs.dom && this._hasDocument) {
      if (_document.addEventListener) {
        _document.addEventListener('click', self._breadcrumbEventHandler('click'), false);
        _document.addEventListener('keypress', self._keypressEventHandler(), false);
      } else if (_document.attachEvent) {
        // IE8 Compatibility
        _document.attachEvent('onclick', self._breadcrumbEventHandler('click'));
        _document.attachEvent('onkeypress', self._keypressEventHandler());
      }
    }

    // record navigation (URL) changes
    // NOTE: in Chrome App environment, touching history.pushState, *even inside
    //       a try/catch block*, will cause Chrome to output an error to console.error
    // borrowed from: https://github.com/angular/angular.js/pull/13945/files
    var chrome = _window.chrome;
    var isChromePackagedApp = chrome && chrome.app && chrome.app.runtime;
    var hasPushAndReplaceState =
      !isChromePackagedApp &&
      _window.history &&
      history.pushState &&
      history.replaceState;
    if (autoBreadcrumbs.location && hasPushAndReplaceState) {
      // TODO: remove onpopstate handler on uninstall()
      var oldOnPopState = _window.onpopstate;
      _window.onpopstate = function() {
        var currentHref = self._location.href;
        self._captureUrlChange(self._lastHref, currentHref);

        if (oldOnPopState) {
          return oldOnPopState.apply(this, arguments);
        }
      };

      var historyReplacementFunction = function(origHistFunction) {
        // note history.pushState.length is 0; intentionally not declaring
        // params to preserve 0 arity
        return function(/* state, title, url */) {
          var url = arguments.length > 2 ? arguments[2] : undefined;

          // url argument is optional
          if (url) {
            // coerce to string (this is what pushState does)
            self._captureUrlChange(self._lastHref, url + '');
          }

          return origHistFunction.apply(this, arguments);
        };
      };

      fill(history, 'pushState', historyReplacementFunction, wrappedBuiltIns);
      fill(history, 'replaceState', historyReplacementFunction, wrappedBuiltIns);
    }

    if (autoBreadcrumbs.console && 'console' in _window && console.log) {
      // console
      var consoleMethodCallback = function(msg, data) {
        self.captureBreadcrumb({
          message: msg,
          level: data.level,
          category: 'console'
        });
      };

      each(['debug', 'info', 'warn', 'error', 'log'], function(_, level) {
        wrapConsoleMethod(console, level, consoleMethodCallback);
      });
    }
  },

  _restoreBuiltIns: function() {
    // restore any wrapped builtins
    var builtin;
    while (this._wrappedBuiltIns.length) {
      builtin = this._wrappedBuiltIns.shift();

      var obj = builtin[0],
        name = builtin[1],
        orig = builtin[2];

      obj[name] = orig;
    }
  },

  _restoreConsole: function() {
    // eslint-disable-next-line guard-for-in
    for (var method in this._originalConsoleMethods) {
      this._originalConsole[method] = this._originalConsoleMethods[method];
    }
  },

  _drainPlugins: function() {
    var self = this;

    // FIX ME TODO
    each(this._plugins, function(_, plugin) {
      var installer = plugin[0];
      var args = plugin[1];
      installer.apply(self, [self].concat(args));
    });
  },

  _parseDSN: function(str) {
    var m = dsnPattern.exec(str),
      dsn = {},
      i = 7;

    try {
      while (i--) dsn[dsnKeys[i]] = m[i] || '';
    } catch (e) {
      throw new RavenConfigError('Invalid DSN: ' + str);
    }

    if (dsn.pass && !this._globalOptions.allowSecretKey) {
      throw new RavenConfigError(
        'Do not specify your secret key in the DSN. See: http://bit.ly/raven-secret-key'
      );
    }

    return dsn;
  },

  _getGlobalServer: function(uri) {
    // assemble the endpoint from the uri pieces
    var globalServer = '//' + uri.host + (uri.port ? ':' + uri.port : '');

    if (uri.protocol) {
      globalServer = uri.protocol + ':' + globalServer;
    }
    return globalServer;
  },

  _handleOnErrorStackInfo: function() {
    // if we are intentionally ignoring errors via onerror, bail out
    if (!this._ignoreOnError) {
      this._handleStackInfo.apply(this, arguments);
    }
  },

  _handleStackInfo: function(stackInfo, options) {
    var frames = this._prepareFrames(stackInfo, options);

    this._triggerEvent('handle', {
      stackInfo: stackInfo,
      options: options
    });

    this._processException(
      stackInfo.name,
      stackInfo.message,
      stackInfo.url,
      stackInfo.lineno,
      frames,
      options
    );
  },

  _prepareFrames: function(stackInfo, options) {
    var self = this;
    var frames = [];
    if (stackInfo.stack && stackInfo.stack.length) {
      each(stackInfo.stack, function(i, stack) {
        var frame = self._normalizeFrame(stack, stackInfo.url);
        if (frame) {
          frames.push(frame);
        }
      });

      // e.g. frames captured via captureMessage throw
      if (options && options.trimHeadFrames) {
        for (var j = 0; j < options.trimHeadFrames && j < frames.length; j++) {
          frames[j].in_app = false;
        }
      }
    }
    frames = frames.slice(0, this._globalOptions.stackTraceLimit);
    return frames;
  },

  _normalizeFrame: function(frame, stackInfoUrl) {
    // normalize the frames data
    var normalized = {
      filename: frame.url,
      lineno: frame.line,
      colno: frame.column,
      function: frame.func || '?'
    };

    // Case when we don't have any information about the error
    // E.g. throwing a string or raw object, instead of an `Error` in Firefox
    // Generating synthetic error doesn't add any value here
    //
    // We should probably somehow let a user know that they should fix their code
    if (!frame.url) {
      normalized.filename = stackInfoUrl; // fallback to whole stacks url from onerror handler
    }

    normalized.in_app = !// determine if an exception came from outside of our app
    // first we check the global includePaths list.
    (
      (!!this._globalOptions.includePaths.test &&
        !this._globalOptions.includePaths.test(normalized.filename)) ||
      // Now we check for fun, if the function name is Raven or TraceKit
      /(Raven|TraceKit)\./.test(normalized['function']) ||
      // finally, we do a last ditch effort and check for raven.min.js
      /raven\.(min\.)?js$/.test(normalized.filename)
    );

    return normalized;
  },

  _processException: function(type, message, fileurl, lineno, frames, options) {
    var prefixedMessage = (type ? type + ': ' : '') + (message || '');
    if (
      !!this._globalOptions.ignoreErrors.test &&
      (this._globalOptions.ignoreErrors.test(message) ||
        this._globalOptions.ignoreErrors.test(prefixedMessage))
    ) {
      return;
    }

    var stacktrace;

    if (frames && frames.length) {
      fileurl = frames[0].filename || fileurl;
      // Sentry expects frames oldest to newest
      // and JS sends them as newest to oldest
      frames.reverse();
      stacktrace = {frames: frames};
    } else if (fileurl) {
      stacktrace = {
        frames: [
          {
            filename: fileurl,
            lineno: lineno,
            in_app: true
          }
        ]
      };
    }

    if (
      !!this._globalOptions.ignoreUrls.test &&
      this._globalOptions.ignoreUrls.test(fileurl)
    ) {
      return;
    }

    if (
      !!this._globalOptions.whitelistUrls.test &&
      !this._globalOptions.whitelistUrls.test(fileurl)
    ) {
      return;
    }

    var data = objectMerge(
      {
        // sentry.interfaces.Exception
        exception: {
          values: [
            {
              type: type,
              value: message,
              stacktrace: stacktrace
            }
          ]
        },
        culprit: fileurl
      },
      options
    );

    // Fire away!
    this._send(data);
  },

  _trimPacket: function(data) {
    // For now, we only want to truncate the two different messages
    // but this could/should be expanded to just trim everything
    var max = this._globalOptions.maxMessageLength;
    if (data.message) {
      data.message = truncate(data.message, max);
    }
    if (data.exception) {
      var exception = data.exception.values[0];
      exception.value = truncate(exception.value, max);
    }

    var request = data.request;
    if (request) {
      if (request.url) {
        request.url = truncate(request.url, this._globalOptions.maxUrlLength);
      }
      if (request.Referer) {
        request.Referer = truncate(request.Referer, this._globalOptions.maxUrlLength);
      }
    }

    if (data.breadcrumbs && data.breadcrumbs.values)
      this._trimBreadcrumbs(data.breadcrumbs);

    return data;
  },

  /**
   * Truncate breadcrumb values (right now just URLs)
   */
  _trimBreadcrumbs: function(breadcrumbs) {
    // known breadcrumb properties with urls
    // TODO: also consider arbitrary prop values that start with (https?)?://
    var urlProps = ['to', 'from', 'url'],
      urlProp,
      crumb,
      data;

    for (var i = 0; i < breadcrumbs.values.length; ++i) {
      crumb = breadcrumbs.values[i];
      if (
        !crumb.hasOwnProperty('data') ||
        !isObject(crumb.data) ||
        objectFrozen(crumb.data)
      )
        continue;

      data = objectMerge({}, crumb.data);
      for (var j = 0; j < urlProps.length; ++j) {
        urlProp = urlProps[j];
        if (data.hasOwnProperty(urlProp) && data[urlProp]) {
          data[urlProp] = truncate(data[urlProp], this._globalOptions.maxUrlLength);
        }
      }
      breadcrumbs.values[i].data = data;
    }
  },

  _getHttpData: function() {
    if (!this._hasNavigator && !this._hasDocument) return;
    var httpData = {};

    if (this._hasNavigator && _navigator.userAgent) {
      httpData.headers = {
        'User-Agent': navigator.userAgent
      };
    }

    // Check in `window` instead of `document`, as we may be in ServiceWorker environment
    if (_window.location && _window.location.href) {
      httpData.url = _window.location.href;
    }

    if (this._hasDocument && _document.referrer) {
      if (!httpData.headers) httpData.headers = {};
      httpData.headers.Referer = _document.referrer;
    }

    return httpData;
  },

  _resetBackoff: function() {
    this._backoffDuration = 0;
    this._backoffStart = null;
  },

  _shouldBackoff: function() {
    return this._backoffDuration && now() - this._backoffStart < this._backoffDuration;
  },

  /**
   * Returns true if the in-process data payload matches the signature
   * of the previously-sent data
   *
   * NOTE: This has to be done at this level because TraceKit can generate
   *       data from window.onerror WITHOUT an exception object (IE8, IE9,
   *       other old browsers). This can take the form of an "exception"
   *       data object with a single frame (derived from the onerror args).
   */
  _isRepeatData: function(current) {
    var last = this._lastData;

    if (
      !last ||
      current.message !== last.message || // defined for captureMessage
      current.culprit !== last.culprit // defined for captureException/onerror
    )
      return false;

    // Stacktrace interface (i.e. from captureMessage)
    if (current.stacktrace || last.stacktrace) {
      return isSameStacktrace(current.stacktrace, last.stacktrace);
    } else if (current.exception || last.exception) {
      // Exception interface (i.e. from captureException/onerror)
      return isSameException(current.exception, last.exception);
    }

    return true;
  },

  _setBackoffState: function(request) {
    // If we are already in a backoff state, don't change anything
    if (this._shouldBackoff()) {
      return;
    }

    var status = request.status;

    // 400 - project_id doesn't exist or some other fatal
    // 401 - invalid/revoked dsn
    // 429 - too many requests
    if (!(status === 400 || status === 401 || status === 429)) return;

    var retry;
    try {
      // If Retry-After is not in Access-Control-Expose-Headers, most
      // browsers will throw an exception trying to access it
      if (supportsFetch()) {
        retry = request.headers.get('Retry-After');
      } else {
        retry = request.getResponseHeader('Retry-After');
      }

      // Retry-After is returned in seconds
      retry = parseInt(retry, 10) * 1000;
    } catch (e) {
      /* eslint no-empty:0 */
    }

    this._backoffDuration = retry
      ? // If Sentry server returned a Retry-After value, use it
        retry
      : // Otherwise, double the last backoff duration (starts at 1 sec)
        this._backoffDuration * 2 || 1000;

    this._backoffStart = now();
  },

  _send: function(data) {
    var globalOptions = this._globalOptions;

    var baseData = {
        project: this._globalProject,
        logger: globalOptions.logger,
        platform: 'javascript'
      },
      httpData = this._getHttpData();

    if (httpData) {
      baseData.request = httpData;
    }

    // HACK: delete `trimHeadFrames` to prevent from appearing in outbound payload
    if (data.trimHeadFrames) delete data.trimHeadFrames;

    data = objectMerge(baseData, data);

    // Merge in the tags and extra separately since objectMerge doesn't handle a deep merge
    data.tags = objectMerge(objectMerge({}, this._globalContext.tags), data.tags);
    data.extra = objectMerge(objectMerge({}, this._globalContext.extra), data.extra);

    // Send along our own collected metadata with extra
    data.extra['session:duration'] = now() - this._startTime;

    if (this._breadcrumbs && this._breadcrumbs.length > 0) {
      // intentionally make shallow copy so that additions
      // to breadcrumbs aren't accidentally sent in this request
      data.breadcrumbs = {
        values: [].slice.call(this._breadcrumbs, 0)
      };
    }

    if (this._globalContext.user) {
      // sentry.interfaces.User
      data.user = this._globalContext.user;
    }

    // Include the environment if it's defined in globalOptions
    if (globalOptions.environment) data.environment = globalOptions.environment;

    // Include the release if it's defined in globalOptions
    if (globalOptions.release) data.release = globalOptions.release;

    // Include server_name if it's defined in globalOptions
    if (globalOptions.serverName) data.server_name = globalOptions.serverName;

    data = this._sanitizeData(data);

    // Cleanup empty properties before sending them to the server
    Object.keys(data).forEach(function(key) {
      if (data[key] == null || data[key] === '' || isEmptyObject(data[key])) {
        delete data[key];
      }
    });

    if (isFunction(globalOptions.dataCallback)) {
      data = globalOptions.dataCallback(data) || data;
    }

    // Why??????????
    if (!data || isEmptyObject(data)) {
      return;
    }

    // Check if the request should be filtered or not
    if (
      isFunction(globalOptions.shouldSendCallback) &&
      !globalOptions.shouldSendCallback(data)
    ) {
      return;
    }

    // Backoff state: Sentry server previously responded w/ an error (e.g. 429 - too many requests),
    // so drop requests until "cool-off" period has elapsed.
    if (this._shouldBackoff()) {
      this._logDebug('warn', 'Raven dropped error due to backoff: ', data);
      return;
    }

    if (typeof globalOptions.sampleRate === 'number') {
      if (Math.random() < globalOptions.sampleRate) {
        this._sendProcessedPayload(data);
      }
    } else {
      this._sendProcessedPayload(data);
    }
  },

  _sanitizeData: function(data) {
    return sanitize(data, this._globalOptions.sanitizeKeys);
  },

  _getUuid: function() {
    return uuid4();
  },

  _sendProcessedPayload: function(data, callback) {
    var self = this;
    var globalOptions = this._globalOptions;

    if (!this.isSetup()) return;

    // Try and clean up the packet before sending by truncating long values
    data = this._trimPacket(data);

    // ideally duplicate error testing should occur *before* dataCallback/shouldSendCallback,
    // but this would require copying an un-truncated copy of the data packet, which can be
    // arbitrarily deep (extra_data) -- could be worthwhile? will revisit
    if (!this._globalOptions.allowDuplicates && this._isRepeatData(data)) {
      this._logDebug('warn', 'Raven dropped repeat event: ', data);
      return;
    }

    // Send along an event_id if not explicitly passed.
    // This event_id can be used to reference the error within Sentry itself.
    // Set lastEventId after we know the error should actually be sent
    this._lastEventId = data.event_id || (data.event_id = this._getUuid());

    // Store outbound payload after trim
    this._lastData = data;

    this._logDebug('debug', 'Raven about to send:', data);

    var auth = {
      sentry_version: '7',
      sentry_client: 'raven-js/' + this.VERSION,
      sentry_key: this._globalKey
    };

    if (this._globalSecret) {
      auth.sentry_secret = this._globalSecret;
    }

    var exception = data.exception && data.exception.values[0];

    // only capture 'sentry' breadcrumb is autoBreadcrumbs is truthy
    if (
      this._globalOptions.autoBreadcrumbs &&
      this._globalOptions.autoBreadcrumbs.sentry
    ) {
      this.captureBreadcrumb({
        category: 'sentry',
        message: exception
          ? (exception.type ? exception.type + ': ' : '') + exception.value
          : data.message,
        event_id: data.event_id,
        level: data.level || 'error' // presume error unless specified
      });
    }

    var url = this._globalEndpoint;
    (globalOptions.transport || this._makeRequest).call(this, {
      url: url,
      auth: auth,
      data: data,
      options: globalOptions,
      onSuccess: function success() {
        self._resetBackoff();

        self._triggerEvent('success', {
          data: data,
          src: url
        });
        callback && callback();
      },
      onError: function failure(error) {
        self._logDebug('error', 'Raven transport failed to send: ', error);

        if (error.request) {
          self._setBackoffState(error.request);
        }

        self._triggerEvent('failure', {
          data: data,
          src: url
        });
        error = error || new Error('Raven send failed (no additional details provided)');
        callback && callback(error);
      }
    });
  },

  _makeRequest: function(opts) {
    // Auth is intentionally sent as part of query string (NOT as custom HTTP header) to avoid preflight CORS requests
    var url = opts.url + '?' + urlencode(opts.auth);

    var evaluatedHeaders = null;
    var evaluatedFetchParameters = {};

    if (opts.options.headers) {
      evaluatedHeaders = this._evaluateHash(opts.options.headers);
    }

    if (opts.options.fetchParameters) {
      evaluatedFetchParameters = this._evaluateHash(opts.options.fetchParameters);
    }

    if (supportsFetch()) {
      evaluatedFetchParameters.body = stringify(opts.data);

      var defaultFetchOptions = objectMerge({}, this._fetchDefaults);
      var fetchOptions = objectMerge(defaultFetchOptions, evaluatedFetchParameters);

      if (evaluatedHeaders) {
        fetchOptions.headers = evaluatedHeaders;
      }

      return _window
        .fetch(url, fetchOptions)
        .then(function(response) {
          if (response.ok) {
            opts.onSuccess && opts.onSuccess();
          } else {
            var error = new Error('Sentry error code: ' + response.status);
            // It's called request only to keep compatibility with XHR interface
            // and not add more redundant checks in setBackoffState method
            error.request = response;
            opts.onError && opts.onError(error);
          }
        })
        ['catch'](function() {
          opts.onError &&
            opts.onError(new Error('Sentry error code: network unavailable'));
        });
    }

    var request = _window.XMLHttpRequest && new _window.XMLHttpRequest();
    if (!request) return;

    // if browser doesn't support CORS (e.g. IE7), we are out of luck
    var hasCORS = 'withCredentials' in request || typeof XDomainRequest !== 'undefined';

    if (!hasCORS) return;

    if ('withCredentials' in request) {
      request.onreadystatechange = function() {
        if (request.readyState !== 4) {
          return;
        } else if (request.status === 200) {
          opts.onSuccess && opts.onSuccess();
        } else if (opts.onError) {
          var err = new Error('Sentry error code: ' + request.status);
          err.request = request;
          opts.onError(err);
        }
      };
    } else {
      request = new XDomainRequest();
      // xdomainrequest cannot go http -> https (or vice versa),
      // so always use protocol relative
      url = url.replace(/^https?:/, '');

      // onreadystatechange not supported by XDomainRequest
      if (opts.onSuccess) {
        request.onload = opts.onSuccess;
      }
      if (opts.onError) {
        request.onerror = function() {
          var err = new Error('Sentry error code: XDomainRequest');
          err.request = request;
          opts.onError(err);
        };
      }
    }

    request.open('POST', url);

    if (evaluatedHeaders) {
      each(evaluatedHeaders, function(key, value) {
        request.setRequestHeader(key, value);
      });
    }

    request.send(stringify(opts.data));
  },

  _evaluateHash: function(hash) {
    var evaluated = {};

    for (var key in hash) {
      if (hash.hasOwnProperty(key)) {
        var value = hash[key];
        evaluated[key] = typeof value === 'function' ? value() : value;
      }
    }

    return evaluated;
  },

  _logDebug: function(level) {
    // We allow `Raven.debug` and `Raven.config(DSN, { debug: true })` to not make backward incompatible API change
    if (
      this._originalConsoleMethods[level] &&
      (this.debug || this._globalOptions.debug)
    ) {
      // In IE<10 console methods do not have their own 'apply' method
      Function.prototype.apply.call(
        this._originalConsoleMethods[level],
        this._originalConsole,
        [].slice.call(arguments, 1)
      );
    }
  },

  _mergeContext: function(key, context) {
    if (isUndefined(context)) {
      delete this._globalContext[key];
    } else {
      this._globalContext[key] = objectMerge(this._globalContext[key] || {}, context);
    }
  }
};

// Deprecations
Raven.prototype.setUser = Raven.prototype.setUserContext;
Raven.prototype.setReleaseContext = Raven.prototype.setRelease;

module.exports = Raven;
