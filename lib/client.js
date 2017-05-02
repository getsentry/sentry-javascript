'use strict';

var stringify = require('json-stringify-safe');
var parsers = require('./parsers');
var zlib = require('zlib');
var utils = require('./utils');
var uuid = require('uuid');
var transports = require('./transports');
var nodeUtil = require('util'); // nodeUtil to avoid confusion with "utils"
var events = require('events');
var domain = require('domain');
var autoBreadcrumbs = require('./breadcrumbs');

var extend = utils.extend;

function Raven() {
  this.breadcrumbs = {
    record: this.captureBreadcrumb.bind(this)
  };
}

nodeUtil.inherits(Raven, events.EventEmitter);

extend(Raven.prototype, {
  config: function config(dsn, options) {
    // We get lots of users using raven-node when they want raven-js, hence this warning if it seems like a browser
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof navigator !== 'undefined') {
      utils.consoleAlertOnce('This looks like a browser environment; are you sure you don\'t want Raven.js for browser JavaScript? https://sentry.io/for/javascript');
    }

    if (arguments.length === 0) {
      // no arguments, use default from environment
      dsn = process.env.SENTRY_DSN;
      options = {};
    }
    if (typeof dsn === 'object') {
      // They must only be passing through options
      options = dsn;
      dsn = process.env.SENTRY_DSN;
    }
    options = options || {};

    this.raw_dsn = dsn;
    this.dsn = utils.parseDSN(dsn);
    this.name = options.name || process.env.SENTRY_NAME || require('os').hostname();
    this.root = options.root || process.cwd();
    this.transport = options.transport || transports[this.dsn.protocol];
    this.sendTimeout = options.sendTimeout || 1;
    this.release = options.release || process.env.SENTRY_RELEASE || '';
    this.environment = options.environment || process.env.SENTRY_ENVIRONMENT || '';

    // autoBreadcrumbs: true enables all, autoBreadcrumbs: false disables all
    // autoBreadcrumbs: { http: true } enables a single type
    // this procedure will ensure that this.autoBreadcrumbs is an object populated
    // with keys -> bools reflecting actual status of all breadcrumb types
    var autoBreadcrumbDefaults = {
      console: false,
      http: false,
      pg: false
    };
    // default to 30, don't allow higher than 100
    this.maxBreadcrumbs = Math.max(0, Math.min(options.maxBreadcrumbs || 30, 100));
    this.autoBreadcrumbs = extend({}, autoBreadcrumbDefaults);
    if (typeof options.autoBreadcrumbs !== 'undefined') {
      for (var key in autoBreadcrumbDefaults) {
        if (autoBreadcrumbDefaults.hasOwnProperty(key)) {
          if (typeof options.autoBreadcrumbs === 'boolean') {
            this.autoBreadcrumbs[key] = options.autoBreadcrumbs;
          } else if (typeof options.autoBreadcrumbs[key] === 'boolean') {
            this.autoBreadcrumbs[key] = options.autoBreadcrumbs[key];
          }
        }
      }
    }

    this.captureUnhandledRejections = options.captureUnhandledRejections;
    this.loggerName = options.logger || '';
    this.dataCallback = options.dataCallback;
    this.shouldSendCallback = options.shouldSendCallback;
    this.sampleRate = typeof options.sampleRate === 'undefined' ? 1 : options.sampleRate;
    this.parseUser = options.parseUser;

    if (!this.dsn) {
      utils.consoleAlert('no DSN provided, error reporting disabled');
    }

    if (this.dsn.protocol === 'https') {
      // In case we want to provide our own SSL certificates / keys
      this.ca = options.ca || null;
    }

    // enabled if a dsn is set
    this._enabled = !!this.dsn;

    var globalContext = this._globalContext = {};
    if (options.tags) {
      globalContext.tags = options.tags;
    }
    if (options.extra) {
      globalContext.extra = options.extra;
    }

    this.onFatalError = this.defaultOnFatalError = function (err, sendErr, eventId) {
      console.error(err.stack);
      process.exit(1);
    };

    this.on('error', function (err) {
      utils.consoleAlert('failed to send exception to sentry: ' + err.message);
    });

    return this;
  },

  install: function install(cb) {
    if (this.installed) return this;

    if (typeof cb === 'function') {
      this.onFatalError = cb;
    }

    process.on('uncaughtException', this.makeErrorHandler());

    if (this.captureUnhandledRejections) {
      var self = this;
      process.on('unhandledRejection', function (reason) {
        self.captureException(reason, function (sendErr, eventId) {
          if (!sendErr) utils.consoleAlert('unhandledRejection captured: ' + eventId);
        });
      });
    }

    for (var key in this.autoBreadcrumbs) {
      if (this.autoBreadcrumbs.hasOwnProperty(key)) {
        this.autoBreadcrumbs[key] && autoBreadcrumbs.instrument(key, this);
      }
    }

    this.installed = true;

    return this;
  },

  uninstall: function uninstall() {
    if (!this.installed) return this;

    autoBreadcrumbs.restoreOriginals();

    // todo: this works for tests for now, but isn't what we ultimately want to be doing
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    this.installed = false;

    return this;
  },

  makeErrorHandler: function () {
    var self = this;
    var calledUncaughtHandler = false;
    var calledFatalError = false;
    var firstError;
    return function (err) {
      if (!calledUncaughtHandler) {
        firstError = err;
        calledUncaughtHandler = true;
        self.captureException(err, function (sendErr, eventId) {
          calledFatalError = true;
          self.onFatalError(err, sendErr, eventId);
        });
      } else if (!calledFatalError) {
        self.onFatalError(firstError, err);
      } else {
        // we hit an error *after* calling onFatalError - pretty fucked
        // maybe this should just be like "default onFatalError"
        console.error(err);
        process.exit(1);
      }
    };
  },

  generateEventId: function generateEventId() {
    return uuid().replace(/-/g, '');
  },

  process: function process(eventId, kwargs, cb) {
    // prod codepaths shouldn't hit this branch, for testing
    if (typeof eventId === 'object') {
      cb = kwargs;
      kwargs = eventId;
      eventId = this.generateEventId();
    }

    var domainContext = domain.active && domain.active.sentryContext || {};
    kwargs.user = extend({}, this._globalContext.user, domainContext.user, kwargs.user);
    kwargs.tags = extend({}, this._globalContext.tags, domainContext.tags, kwargs.tags);
    kwargs.extra = extend({}, this._globalContext.extra, domainContext.extra, kwargs.extra);
    kwargs.breadcrumbs = {
      values: domainContext.breadcrumbs || this._globalContext.breadcrumbs || []
    };

    kwargs.modules = utils.getModules();
    kwargs.server_name = kwargs.server_name || this.name;

    if (typeof process.version !== 'undefined') {
      kwargs.extra.node = process.version;
    }

    kwargs.environment = kwargs.environment || this.environment;
    kwargs.logger = kwargs.logger || this.loggerName;
    kwargs.event_id = eventId;
    kwargs.timestamp = new Date().toISOString().split('.')[0];
    kwargs.project = this.dsn.project_id;
    kwargs.platform = 'node';

    // Only include release information if it is set
    if (this.release) {
      kwargs.release = this.release;
    }

    if (this.dataCallback) {
      kwargs = this.dataCallback(kwargs);
    }

    var shouldSend = true;
    if (!this._enabled) shouldSend = false;
    if (this.shouldSendCallback && !this.shouldSendCallback(kwargs)) shouldSend = false;
    if (Math.random() >= this.sampleRate) shouldSend = false;

    if (shouldSend) {
      this.send(kwargs, cb);
    } else {
      // wish there was a good way to communicate to cb why we didn't send; worth considering cb api change?
      // could be shouldSendCallback, could be disabled, could be sample rate
      // avoiding setImmediate here because node 0.8
      cb && setTimeout(function () {
        cb(null, eventId);
      }, 0);
    }
  },

  send: function send(kwargs, cb) {
    var self = this;
    var skwargs = stringify(kwargs);
    var eventId = kwargs.event_id;

    zlib.deflate(skwargs, function (err, buff) {
      var message = buff.toString('base64'),
          timestamp = new Date().getTime(),
          headers = {
            'X-Sentry-Auth': utils.getAuthHeader(timestamp, self.dsn.public_key, self.dsn.private_key),
            'Content-Type': 'application/octet-stream',
            'Content-Length': message.length
          };

      self.transport.send(self, message, headers, eventId, cb);
    });
  },

  captureMessage: function captureMessage(message, kwargs, cb) {
    if (!cb && typeof kwargs === 'function') {
      cb = kwargs;
      kwargs = {};
    } else {
      kwargs = kwargs || {};
    }
    var eventId = this.generateEventId();
    this.process(eventId, parsers.parseText(message, kwargs), cb);

    return eventId;
  },

  captureException: function captureException(err, kwargs, cb) {
    if (!(err instanceof Error)) {
      // This handles when someone does:
      //   throw "something awesome";
      // We synthesize an Error here so we can extract a (rough) stack trace.
      err = new Error(err);
    }

    if (!cb && typeof kwargs === 'function') {
      cb = kwargs;
      kwargs = {};
    } else {
      kwargs = kwargs || {};
    }

    var self = this;
    var eventId = this.generateEventId();
    parsers.parseError(err, kwargs, function (kw) {
      self.process(eventId, kw, cb);
    });

    return eventId;
  },

  /* The onErr param here is sort of ugly and won't typically be used
   * but it lets us write the requestHandler middleware in terms of this function.
   * We could consider getting rid of it and just duplicating the domain
   * instantiation etc logic in the requestHandler middleware
   */
  context: function (ctx, func) {
    if (!func && typeof ctx === 'function') {
      func = ctx;
      ctx = {};
    }

    // todo/note: raven-js takes an args param to do apply(this, args)
    // i don't think it's correct/necessary to bind this to the wrap call
    // and i don't know if we need to support the args param; it's undocumented
    return this.wrap(ctx, func).apply(null);
  },

  wrap: function (options, func) {
    if (!func && typeof options === 'function') {
      func = options;
      options = {};
    }

    var wrapDomain = domain.create();
    // todo: better property name than sentryContext, maybe __raven__ or sth?
    wrapDomain.sentryContext = options;

    wrapDomain.on('error', this.makeErrorHandler());
    var wrapped = wrapDomain.bind(func);

    for (var property in func) {
      if ({}.hasOwnProperty.call(func, property)) {
        wrapped[property] = func[property];
      }
    }
    wrapped.prototype = func.prototype;
    wrapped.__raven__ = true;
    wrapped.__inner__ = func;
    // note: domain.bind sets wrapped.domain, but it's not documented, unsure if we should rely on that
    wrapped.__domain__ = wrapDomain;

    return wrapped;
  },

  interceptErr: function (options, func) {
    if (!func && typeof options === 'function') {
      func = options;
      options = {};
    }
    var self = this;
    var wrapped = function () {
      var err = arguments[0];
      if (err instanceof Error) {
        self.captureException(err, options);
      } else {
        func.apply(null, arguments);
      }
    };

    // repetitive with wrap
    for (var property in func) {
      if ({}.hasOwnProperty.call(func, property)) {
        wrapped[property] = func[property];
      }
    }
    wrapped.prototype = func.prototype;
    wrapped.__raven__ = true;
    wrapped.__inner__ = func;

    return wrapped;
  },

  setContext: function setContext(ctx) {
    if (domain.active) {
      domain.active.sentryContext = ctx;
    } else {
      this._globalContext = ctx;
    }
    return this;
  },

  mergeContext: function mergeContext(ctx) {
    extend(this.getContext(), ctx);
    return this;
  },

  getContext: function getContext() {
    if (domain.active) {
      if (!domain.active.sentryContext) {
        domain.active.sentryContext = {};
        utils.consoleAlert('sentry context not found on active domain');
      }
      return domain.active.sentryContext;
    }
    return this._globalContext;
  },

  setCallbackHelper: function (propertyName, callback) {
    var original = this[propertyName];
    if (typeof callback === 'function') {
      this[propertyName] = function (data) {
        return callback(data, original);
      };
    } else {
      this[propertyName] = callback;
    }

    return this;
  },

  /*
   * Set the dataCallback option
   *
   * @param {function} callback The callback to run which allows the
   *                            data blob to be mutated before sending
   * @return {Raven}
   */
  setDataCallback: function (callback) {
    return this.setCallbackHelper('dataCallback', callback);
  },

  /*
   * Set the shouldSendCallback option
   *
   * @param {function} callback The callback to run which allows
   *                            introspecting the blob before sending
   * @return {Raven}
   */
  setShouldSendCallback: function (callback) {
    return this.setCallbackHelper('shouldSendCallback', callback);
  },

  requestHandler: function () {
    var self = this;
    return function (req, res, next) {
      self.context({}, function () {
        domain.active.add(req);
        domain.active.add(res);
        next();
      });
    };
  },

  errorHandler: function () {
    var self = this;
    return function (err, req, res, next) {
      var status = err.status || err.statusCode || err.status_code || 500;

      // skip anything not marked as an internal server error
      if (status < 500) return next(err);

      var kwargs = parsers.parseRequest(req, self.parseUser);
      var eventId = self.captureException(err, kwargs);
      res.sentry = eventId;
      return next(err);
    };
  },

  captureBreadcrumb: function (breadcrumb) {
    // Avoid capturing global-scoped breadcrumbs before instrumentation finishes
    if (!this.installed) return;

    breadcrumb = extend({
      timestamp: +new Date / 1000
    }, breadcrumb);

    var currCtx = this.getContext();
    if (!currCtx.breadcrumbs) currCtx.breadcrumbs = [];
    currCtx.breadcrumbs.push(breadcrumb);
    if (currCtx.breadcrumbs.length > this.maxBreadcrumbs) {
      currCtx.breadcrumbs.shift();
    }

    this.setContext(currCtx);
  }
});

// Deprecations
extend(Raven.prototype, {
  getIdent: function getIdent(result) {
    utils.consoleAlertOnce('getIdent has been deprecated and will be removed in v2.0');
    return result;
  },
  captureError: function captureError() {
    utils.consoleAlertOnce('captureError has been deprecated and will be removed in v2.0; use captureException instead');
    return this.captureException.apply(this, arguments);
  },
  captureQuery: function captureQuery() {
    utils.consoleAlertOnce('captureQuery has been deprecated and will be removed in v2.0');
    return this;
  },
  setUserContext: function setUserContext() {
    utils.consoleAlertOnce('setUserContext has been deprecated and will be removed in v2.0; use setContext instead');
    return this;
  },
  setExtraContext: function setExtraContext() {
    utils.consoleAlertOnce('setExtraContext has been deprecated and will be removed in v2.0; use setContext instead');
    return this;
  },
  setTagsContext: function setTagsContext() {
    utils.consoleAlertOnce('setTagsContext has been deprecated and will be removed in v2.0; use setContext instead');
    return this;
  },
});
Raven.prototype.get_ident = Raven.prototype.getIdent;

// Maintain old API compat, need to make sure arguments length is preserved
function Client(dsn, options) {
  if (dsn instanceof Client) return dsn;
  var ravenInstance = new Raven();
  return ravenInstance.config.apply(ravenInstance, arguments);
}
nodeUtil.inherits(Client, Raven);

// Singleton-by-default but not strictly enforced
// todo these extra export props are sort of an adhoc mess, better way to manage?
var defaultInstance = new Raven();
defaultInstance.Client = Client;
defaultInstance.version = require('../package.json').version;
defaultInstance.disableConsoleAlerts = utils.disableConsoleAlerts;

module.exports = defaultInstance;
