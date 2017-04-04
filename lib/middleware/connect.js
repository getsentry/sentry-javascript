'use strict';

var Raven = require('../client');
var utils = require('../utils');

// Legacy support
var connectMiddleware = function (client) {
  return connectMiddleware.errorHandler(client);
};

var getClient = function (clientOrDSN) {
  // Raven is an instance, so use Raven.constructor for instanceof check
  return clientOrDSN instanceof Raven.constructor ? clientOrDSN : new Raven.Client(clientOrDSN);
};

// Error handler. This should be the last item listed in middleware, but
// before any other error handlers.
connectMiddleware.errorHandler = function (clientOrDSN) {
  utils.consoleAlertOnce('top-level Raven.middleware.*.errorHandler has been deprecated and will be removed in v2.0; use Raven.errorHandler() instance method instead');
  return getClient(clientOrDSN).errorHandler();
};

// Ensures asynchronous exceptions are routed to the errorHandler. This
// should be the **first** item listed in middleware.
connectMiddleware.requestHandler = function (clientOrDSN) {
  utils.consoleAlertOnce('top-level Raven.middleware.*.requestHandler has been deprecated and will be removed in v2.0; use Raven.requestHandler() instance method instead');
  return getClient(clientOrDSN).requestHandler();
};

// for testing purposes only; not gonna worry about a nicer test exposure scheme since this code is going away soon
connectMiddleware.getClient = getClient;

module.exports = connectMiddleware;
