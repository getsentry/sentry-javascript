Express
=======

.. code-block:: javascript

    var app = require('express')();
    var raven = require('raven');

    function onError(err, req, res, next) {
        // The error id is attached to `res.sentry` to be returned
        // and optionally displayed to the user for support.
        res.statusCode = 500;
        res.end(res.sentry+'\n');
    }

    // The request handler must be the first item
    app.use(raven.middleware.express.requestHandler('{{ SENTRY_DSN }}'));

    app.get('/', function mainHandler(req, res) {
        throw new Error('Broke!');
    });

    // The error handler must be before any other error middleware
    app.use(raven.middleware.express.errorHandler('{{ SENTRY_DSN }}'));

    // Optional fallthrough error handler
    app.use(onError);

    app.listen(3000);
