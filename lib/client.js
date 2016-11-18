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

var extend = utils.extend;

function Raven() {
  this.breadcrumbs = {
    record: this.captureBreadcrumb.bind(this)
  };
}

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
    this.maxBreadcrumbs = Math.max(0, Math.min(options.maxBreadcrumbs || 100, 100));

    this.captureUnhandledRejections = options.captureUnhandledRejections;
    this.loggerName = options.logger || '';
    this.dataCallback = options.dataCallback;
    this.shouldSendCallback = options.shouldSendCallback;

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

  install: function install(opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
    }

    registerExceptionHandler(this, cb);
    if (this.captureUnhandledRejections) {
      registerRejectionHandler(this, cb);
    }

    if (opts.autoBreadcrumbs) {
      wrapConsole(this);
      wrapHttp(this);
    }

    return this;
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
    console.log('breadcrumb check');
    console.log(domainContext === kwargs);
    console.log(domainContext.breadcrumbs);
    kwargs.breadcrumbs = { values: domainContext.breadcrumbs || [] };

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
    if (this.shouldSendCallback && !this.shouldSendCallback()) shouldSend = false;

    if (shouldSend) {
      this.send(kwargs, cb);
    } else {
      // wish there was a good way to communicate to cb why we didn't send; worth considering cb api change?
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

    console.log('sending an exception!');

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

    wrapDomain.on('error', onErr);
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
    return domain.active ? domain.active.sentryContext : this._globalContext;
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
      self.context({}, next, next);
    };
  },

  errorHandler: function () {
    var self = this;
    return function (err, req, res, next) {
      var status = err.status || err.statusCode || err.status_code || 500;

      // skip anything not marked as an internal server error
      if (status < 500) return next(err);

      var kwargs = parsers.parseRequest(req);
      var eventId = self.captureException(err, kwargs);
      res.sentry = eventId;
      return next(err);
    };
  },

  captureBreadcrumb: function (breadcrumb) {
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
    utils.consoleAlert('getIdent has been deprecated and will be removed in v2.0');
    return result;
  },
  captureError: function captureError() {
    utils.consoleAlert('captureError has been deprecated and will be removed in v2.0');
    return this.captureException.apply(this, arguments);
  },
  patchGlobal: function (cb) {
    utils.consoleAlert('patchGlobal has been deprecated and will be removed in v2.0');
    registerExceptionHandler(this, cb);
    return this;
  },
  setUserContext: function setUserContext() {
    utils.consoleAlert('setUserContext has been deprecated and will be removed in v2.0; use setContext instead');
    return this;
  },
  setExtraContext: function setExtraContext() {
    utils.consoleAlert('setExtraContext has been deprecated and will be removed in v2.0; use setContext instead');
    return this;
  },
  setTagsContext: function setTagsContext() {
    utils.consoleAlert('setTagsContext has been deprecated and will be removed in v2.0; use setContext instead');
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
defaultInstance.patchGlobal = patchGlobal;
defaultInstance.version = require('../package.json').version;
defaultInstance.disableConsoleAlerts = utils.disableConsoleAlerts;

module.exports = defaultInstance;

function registerExceptionHandler(client, cb) {
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

      called = true;
    }

    var eventId = client.captureException(err);
    return utils.consoleAlert('uncaughtException: ' + eventId);
  });
}

function registerRejectionHandler(client, cb) {
  process.on('unhandledRejection', function (reason) {
    var eventId = client.captureException(reason, function (sendErr) {
      cb && cb(!sendErr, reason);
    });
    return utils.consoleAlert('unhandledRejection: ' + eventId);
  });
}

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

  registerExceptionHandler(client, cb);
}

function wrapConsole(Raven) {
  var oldConsole = console;
  ['log', 'error'].forEach(function (method) {
    var oldConsoleMethod = oldConsole[method];
    console[method] = function () {
      var args = [].slice.call(arguments);
      var outputStr = '' + args.join(' ');

      Raven.captureBreadcrumb({
        category: 'console',
        level: 'log',
        message: outputStr
      });

      Function.prototype.apply.call(
        oldConsoleMethod,
        oldConsole,
        args
      );
    };
  });
}

function wrapHttp(Raven) {
  var http = require('http');
  var OldClientRequest = http.ClientRequest;
  var ClientRequest = function (options, cb) {
    // todo still capture breadcrumb if response never comes? or is it guaranteed to?
    var self = this;
    OldClientRequest.call(self, options, cb);

    var method = self.method;
    var url = (self.agent && self.agent.protocol || '') +
              (self._headers && self._headers.host || '') +
              self.path;

    self.once('response', function (response) {
      Raven.captureBreadcrumb({
        type: 'http',
        category: 'http',
        data: {
          method: method,
          url: url,
          status_code: response.statusCode
        }
      });
    });
  };
  nodeUtil.inherits(ClientRequest, OldClientRequest);
  http.ClientRequest = ClientRequest;

  http.request = function (options, cb) {
    return new http.ClientRequest(options, cb);
  };

  http.get = function (options, cb) {
    var req = http.request(options, cb);
    req.end();
    return req;
  };
}

//   http.get = function (url, callback) {
//     // Raven.captureBreadcrumb({
//     //   type: 'http',
//     //   category: 'http.get',
//     //   message: 'you sent an http request to ' + url
//     // });
//     oldRequest(url, function (response) {
//       var reqData = {
//         method: 'GET',
//         url: url,
//         status_code: response.statusCode
//       };
//       Raven.captureBreadcrumb({
//         type: 'http',
//         category: 'http.get',
//         data: reqData
//       });
//       callback(response);
//     });
//   };
// }
