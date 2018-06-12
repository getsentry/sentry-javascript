Express
=======

.. code-block:: javascript

    var app = require('express')();
    var Raven = require('raven');

    // Must configure Raven before doing anything else with it
    Raven.config('__DSN__').install();

    // The request handler must be the first middleware on the app
    app.use(Raven.requestHandler());

    app.get('/', function mainHandler(req, res) {
        throw new Error('Broke!');
    });

    // The error handler must be before any other error middleware
    app.use(Raven.errorHandler());

    // Optional fallthrough error handler
    app.use(function onError(err, req, res, next) {
        // The error id is attached to `res.sentry` to be returned
        // and optionally displayed to the user for support.
        res.statusCode = 500;
        res.end(res.sentry + '\n');
    });

    app.listen(3000);
