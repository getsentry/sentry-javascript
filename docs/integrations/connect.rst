Connect
=======

.. code-block:: javascript

  var connect = require('connect');
  var raven = require('raven');

  function mainHandler(req, res) {
      throw new Error('Broke!');
  }

  function onError(err, req, res, next) {
      // The error id is attached to `res.sentry` to be returned
      // and optionally displayed to the user for support.
      res.statusCode = 500;
      res.end(res.sentry+'\n');
  }

  connect(
      // The request handler be the first item
      raven.middleware.connect.requestHandler('___DSN___'),

      connect.bodyParser(),
      connect.cookieParser(),
      mainHandler,

      // The error handler must be before any other error middleware
      raven.middleware.connect.errorHandler('___DSN___'),

      // Optional fallthrough error handler
      onError,
  ).listen(3000);
