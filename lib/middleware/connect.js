'use strict';

var Raven = require('../client');

// Legacy support
var connectMiddleware = function (client) {
  return connectMiddleware.errorHandler(client);
};

// Error handler. This should be the last item listed in middleware, but
// before any other error handlers.
connectMiddleware.errorHandler = function (client) {
  client = client instanceof Raven.Client ? client : new Raven.Client(client);
  return client.errorHandler();
};

// Ensures asynchronous exceptions are routed to the errorHandler. This
// should be the **first** item listed in middleware.
connectMiddleware.requestHandler = function (client) {
  client = client instanceof Raven.Client ? client : new Raven.Client(client);
  return client.requestHandler();
};

module.exports = connectMiddleware;
