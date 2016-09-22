'use strict';

var raven = require('../client');
var parsers = require('../parsers');
var extend = require('../utils').extend;
var domain = require('domain');

// Legacy support
var connectMiddleware = function (client) {
  return connectMiddleware.errorHandler(client);
};

// Error handler. This should be the last item listed in middleware, but
// before any other error handlers.
connectMiddleware.errorHandler = function (client) {
  client = client instanceof raven.Client ? client : new raven.Client(client);
  return function (err, req, res, next) {
    var status = err.status || err.statusCode || err.status_code || 500;

    // skip anything not marked as an internal server error
    if (status < 500) return next(err);

    var kwargs = parsers.parseRequest(req);
    if (domain.active && domain.active.sentryContext) {
      kwargs = extend(kwargs, domain.active.sentryContext);
    }
    return client.captureException(err, kwargs, function (result) {
      res.sentry = client.getIdent(result);
      next(err, req, res);
    });
  };
};

// Ensures asynchronous exceptions are routed to the errorHandler. This
// should be the **first** item listed in middleware.
connectMiddleware.requestHandler = function (client) {
  return function (req, res, next) {
    client.runWithContext({}, next, next);
  };
};

module.exports = connectMiddleware;
