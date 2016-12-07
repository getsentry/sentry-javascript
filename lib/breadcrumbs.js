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

          var msg = '' + args.join(' ');
          var data = {
            level: sentryLevel,
            logger: 'console',
            extra: {
              'arguments': args
            }
          };

          Raven.captureBreadcrumb({
            message: msg,
            level: data.level,
            category: 'console'
          });

          originalConsoleLevel.apply(console, args);
        };
      });
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
      var self = this;
      OrigClientRequest.call(self, options, cb);

      var method = self.method;
      var url = (self.agent && self.agent.protocol || '') + '//' +
                (self._headers && self._headers.host || '') +
                self.path;

      // Don't capture breadcrumb for our own requests
      if (!Raven.dsn || url.indexOf(Raven.dsn.public_key) === -1) {
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
      }
    };
    util.inherits(ClientRequest, OrigClientRequest);
    http.ClientRequest = ClientRequest;

    // http.request orig refs module-internal ClientRequest, not exported one, so
    // it still points at orig ClientRequest after our monkeypatch; these reimpls
    // just get that reference updated to use our new ClientRequest
    http.request = function (options, cb) {
      return new http.ClientRequest(options, cb);
    };

    http.get = function (options, cb) {
      var req = http.request(options, cb);
      req.end();
      return req;
    };
  },

  postgres: function (Raven) {
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

module.exports = {
  instrument: instrument
};
