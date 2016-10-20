'use strict';

var stringify = require('json-stringify-safe');
var parsers = require('./parsers');
var zlib = require('zlib');
var utils = require('./utils');
var uuid = require('node-uuid');
var transports = require('./transports');
var nodeUtil = require('util'); // nodeUtil to avoid confusion with "utils"
var events = require('events');
var domain = require('domain');

var extend = utils.extend;

function Raven() {}

nodeUtil.inherits(Raven, events.EventEmitter);

extend(Raven.prototype, {
  config: function config(dsn, options) {
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
    this.release = options.release || process.env.SENTRY_RELEASE || '';
    this.environment = options.environment || process.env.SENTRY_ENVIRONMENT || '';

    this.loggerName = options.logger || '';
    this.dataCallback = options.dataCallback;

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

    this.on('error', function (err) {
      utils.consoleAlert('failed to send exception to sentry: ' + err.message);
    });

    return this;
  },

  install: function install(cb) {
    patchGlobal(this, cb);
    return this;
  },

  generateEventId: function generateEventId() {
    return uuid().replace(/-/g, '');
  },

  process: function process(eventId, kwargs, cb) {
    // prod codepaths shouldn't hit this branch, for testing
    if (typeof eventId === 'object') {
      kwargs = eventId;
      eventId = this.generateEventId();
    }

    kwargs.modules = utils.getModules();
    kwargs.server_name = kwargs.server_name || this.name;

    if (typeof process.version !== 'undefined') {
      kwargs.extra.node = process.version;
    }

    kwargs.environment = kwargs.environment || this.environment;
    kwargs.extra = extend({}, this._globalContext.extra, kwargs.extra);
    kwargs.tags = extend({}, this._globalContext.tags, kwargs.tags);

    kwargs.logger = kwargs.logger || this.loggerName;
    kwargs.event_id = eventId;
    kwargs.timestamp = new Date().toISOString().split('.')[0];
    kwargs.project = this.dsn.project_id;
    kwargs.platform = 'node';

    if (this._globalContext.user) {
      kwargs.user = this._globalContext.user || kwargs.user;
    }

    // Only include release information if it is set
    if (this.release) {
      kwargs.release = this.release;
    }

    if (this.dataCallback) {
      kwargs = this.dataCallback(kwargs);
    }

    if (this._enabled) {
      this.send(kwargs, cb);
    } else {
      setImmediate(function () {
        cb(null, eventId);
      });
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

  captureQuery: function captureQuery(query, engine, kwargs, cb) {
    if (!cb && typeof kwargs === 'function') {
      cb = kwargs;
      kwargs = {};
    } else {
      kwargs = kwargs || {};
    }

    var eventId = this.generateEventId();
    this.process(eventId, parsers.parseQuery(query, engine, kwargs), cb);

    return eventId;
  },

  /* The onErr param here is sort of ugly and won't typically be used
   * but it lets us write the requestHandler middleware in terms of this function.
   * We could consider getting rid of it and just duplicating the domain
   * instantiation etc logic in the requestHandler middleware
   */
  context: function (ctx, func, onErr) {
    if (!func && typeof ctx === 'function') {
      func = ctx;
      ctx = {};
    }

    // todo/note: raven-js takes an args param to do apply(this, args)
    // i don't think it's correct/necessary to bind this to the wrap call
    // and i don't know if we need to support the args param; it's undocumented
    return this.wrap(ctx, func, onErr).apply(null);
  },

  wrap: function (options, func, onErr) {
    if (!func && typeof options === 'function') {
      func = options;
      options = {};
    }

    var wrapDomain = domain.create();
    // todo: better property name than sentryContext, maybe __raven__ or sth?
    wrapDomain.sentryContext = options;

    var self = this;
    if (typeof onErr !== 'function') {
      onErr = function (err) {
        self.captureException(err, wrapDomain.sentryContext);
      };
    }

    wrapDomain.on('error', function (err) {
      onErr(err, wrapDomain.sentryContext);
    });

    var wrapped = function wrapped() {
      // todo make sure this is the best/right way to do this
      var args = Array.prototype.slice.call(arguments);
      args.unshift(func);
      wrapDomain.run.apply(wrapDomain, args);
    };

    for (var property in func) {
      if ({}.hasOwnProperty.call(func, property)) {
        wrapped[property] = func[property];
      }
    }
    wrapped.prototype = func.prototype;
    wrapped.__raven__ = true;
    wrapped.__inner__ = func;
    wrapped.__domain__ = wrapDomain;

    return wrapped;
  },

  setContext: function setContext(ctx) {
    if (!domain.active) {
      utils.consoleAlert('attempt to setContext outside context scope');
    } else {
      domain.active.sentryContext = ctx;
    }
  },

  // todo consider this naming; maybe "mergeContext" instead?
  updateContext: function updateContext(ctx) {
    if (!domain.active) {
      utils.consoleAlert('attempt to updateContext outside context scope');
    } else {
      domain.active.sentryContext = extend({}, domain.active.sentryContext, ctx);
    }
  },

  getContext: function setContext(ctx) {
    if (!domain.active) {
      utils.consoleAlert('attempt to getContext outside context scope');
      return null;
    }
    return domain.active.sentryContext;
  },

  /*
   * Set/clear a user to be sent along with the payload.
   *
   * @param {object} user An object representing user data [optional]
   * @return {Raven}
   */
  setUserContext: function setUserContext(user) {
    utils.consoleAlert('setUserContext has been deprecated and will be removed in v2.0');
    this._globalContext.user = user;
    return this;
  },

  /*
   * Merge extra attributes to be sent along with the payload.
   *
   * @param {object} extra An object representing extra data [optional]
   * @return {Raven}
   */
  setExtraContext: function setExtraContext(extra) {
    utils.consoleAlert('setExtraContext has been deprecated and will be removed in v2.0');
    this._globalContext.extra = extend({}, this._globalContext.extra, extra);
    return this;
  },

  /*
   * Merge tags to be sent along with the payload.
   *
   * @param {object} tags An object representing tags [optional]
   * @return {Raven}
   */
  setTagsContext: function setTagsContext(tags) {
    utils.consoleAlert('setTagsContext has been deprecated and will be removed in v2.0');
    this._globalContext.tags = extend({}, this._globalContext.tags, tags);
    return this;
  }
});


// Deprecations
extend(Raven.prototype, {
  getIdent: function getIdent(result) {
    utils.consoleAlert('getIdent has been deprecated and will be removed in v2.0');
    return result;
  },
  captureError: function captureError() {
    utils.consoleAlert('captureError has been deprecated and will be removed in v2.0');
    this.captureException.apply(this, arguments);
  },
  patchGlobal: function (cb) {
    utils.consoleAlert('patchGlobal has been deprecated and will be removed in v2.0');
    return this.install(cb);
  }
});
Raven.prototype.get_ident = Raven.prototype.getIdent;

// Maintain old API compat, need to make sure arguments length is preserved
function Client(dsn, options) {
  var ravenInstance = new Raven();
  return ravenInstance.config.apply(ravenInstance, arguments);
}
nodeUtil.inherits(Client, Raven);

// Singleton-by-default but not strictly enforced
// todo these extra export props are sort of an adhoc mess, better way to manage?
var defaultInstance = new Raven();
defaultInstance.Client = Client;
defaultInstance.patchGlobal = patchGlobal;
defaultInstance.version = require('../package.json').version;
defaultInstance.disableConsoleAlerts = utils.disableConsoleAlerts;

module.exports = defaultInstance;

function patchGlobal(client, cb) {
  // handle when the first argument is the callback, with no client specified
  if (typeof client === 'function') {
    cb = client;
    client = new Client();
    // first argument is a string DSN
  } else if (typeof client === 'string') {
    client = new Client(client);
  }
  // at the end, if we still don't have a Client, let's make one!
  !(client instanceof Raven) && (client = new Client());

  var called = false;
  process.on('uncaughtException', function (err) {
    if (cb) { // bind event listeners only if a callback was supplied
      var onLogged = function onLogged() {
        called = false;
        cb(true, err);
      };

      var onError = function onError() {
        called = false;
        cb(false, err);
      };

      if (called) {
        client.removeListener('logged', onLogged);
        client.removeListener('error', onError);
        return cb(false, err);
      }

      client.once('logged', onLogged);
      client.once('error', onError);
    }

    called = true;

    var eventId = client.captureException(err);
    return utils.consoleAlert('uncaughtException: ' + eventId);
  });
}
