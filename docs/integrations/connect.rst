Connect
=======

.. code-block:: javascript

  var connect = require('connect');
  var Raven = require('raven');

  // Must configure Raven before doing anything else with it
  Raven.config('___DSN___').install();

  function mainHandler(req, res) {
      throw new Error('Broke!');
  }

  function onError(err, req, res, next) {
      // The error id is attached to `res.sentry` to be returned
      // and optionally displayed to the user for support.
      res.statusCode = 500;
      res.end(res.sentry + '\n');
  }

  connect(
      // The request handler be the first item
      Raven.requestHandler(),

      connect.bodyParser(),
      connect.cookieParser(),
      mainHandler,

      // The error handler must be before any other error middleware
      Raven.errorHandler(),

      // Optional fallthrough error handler
      onError,
  ).listen(3000);
