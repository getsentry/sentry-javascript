'use strict';

var util = require('util');
var utils = require('./utils.js');

/**
 * Polyfill a method
 * @param obj object e.g. `document`
 * @param name method name present on object e.g. `addEventListener`
 * @param replacement replacement function
 * @param track {optional} record instrumentation to an array
 */
function fill(obj, name, replacement, track) {
  var orig = obj[name];
  obj[name] = replacement(orig);
  if (track) {
    track.push([obj, name, orig]);
  }
}

var originals = [];

var wrappers = {
  console: function (Raven) {
    var wrapConsoleMethod = function (level) {
      if (!(level in console)) {
        return;
      }

      fill(console, level, function (originalConsoleLevel) {
        var sentryLevel = level === 'warn'
            ? 'warning'
            : level;

        return function () {
          var args = [].slice.call(arguments);

          Raven.captureBreadcrumb({
            message: util.format.apply(null, args),
            level: sentryLevel,
            category: 'console'
          });

          originalConsoleLevel.apply(console, args);
        };
      }, originals);
    };

    ['debug', 'info', 'warn', 'error', 'log'].forEach(wrapConsoleMethod);
  },

  http: function (Raven) {
    var http = require('http');
    var OrigClientRequest = http.ClientRequest;
    var ClientRequest = function (options, cb) {
      // Note: this won't capture a breadcrumb if a response never comes
      // It would be useful to know if that was the case, though, so
      // todo: revisit to see if we can capture sth indicating response never came
      // possibility: capture one breadcrumb for "req sent" and one for "res recvd"
      // seems excessive but solves the problem and *is* strictly more information
      // could be useful for weird response sequencing bug scenarios
      OrigClientRequest.call(this, options, cb);

      // We could just always reconstruct this from this.agent, this._headers, this.path, etc
      // but certain other http-instrumenting libraries (like nock, which we use for tests) fail to
      // maintain the guarantee that after calling OrigClientRequest, those fields will be populated
      if (typeof options === 'string') {
        this.__ravenBreadcrumbUrl = options;
      } else {
        this.__ravenBreadcrumbUrl = (options.protocol || '') + '//' +
              (options.hostname || options.host || '') +
              (options.path || '/');
      }
    };
    util.inherits(ClientRequest, OrigClientRequest);

    fill(ClientRequest.prototype, 'emit', function (origEmit) {
      return function (evt, maybeResp) {
        if (evt === 'response' && this.__ravenBreadcrumbUrl) {
          if (!Raven.dsn || this.__ravenBreadcrumbUrl.indexOf(Raven.dsn.host) === -1) {
            Raven.captureBreadcrumb({
              type: 'http',
              category: 'http',
              data: {
                method: this.method,
                url: this.__ravenBreadcrumbUrl,
                status_code: maybeResp.statusCode
              }
            });
          }
        }
        return origEmit.apply(this, arguments);
      };
    });

    fill(http, 'ClientRequest', function () {
      return ClientRequest;
    }, originals);

    // http.request orig refs module-internal ClientRequest, not exported one, so
    // it still points at orig ClientRequest after our monkeypatch; these reimpls
    // just get that reference updated to use our new ClientRequest
    fill(http, 'request', function () {
      return function (options, cb) {
        return new http.ClientRequest(options, cb);
      };
    }, originals);

    fill(http, 'get', function () {
      return function (options, cb) {
        var req = http.request(options, cb);
        req.end();
        return req;
      };
    }, originals);
  },

  pg: function (Raven) {
    // Using fill helper here is hard because of `this` binding
    var pg = require('pg');
    var origQuery = pg.Connection.prototype.query;
    pg.Connection.prototype.query = function (text) {
      Raven.captureBreadcrumb({
        category: 'postgres',
        message: text
      });
      origQuery.call(this, text);
    };
    originals.push([pg.Connection.prototype, 'query', origQuery]);
  }
};

function instrument(key, Raven) {
  try {
    wrappers[key](Raven);
    utils.consoleAlert('Enabled automatic breadcrumbs for ' + key);
  } catch (e) {
    // associated module not available
  }
}

function restoreOriginals() {
  var original;
  // eslint-disable-next-line no-cond-assign
  while (original = originals.shift()) {
    var obj = original[0];
    var name = original[1];
    var orig = original[2];
    obj[name] = orig;
  }
}

module.exports = {
  instrument: instrument,
  restoreOriginals: restoreOriginals
};
