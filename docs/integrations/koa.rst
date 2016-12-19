Koa
===

.. code-block:: javascript

    var koa = require('koa');
    var Raven = require('raven');

    var app = koa();
    Raven.config('___DSN___').install();

    app.on('error', function (err) {
        sentry.captureException(err, function (err, eventId) {
            console.log('Reported error ' + eventId);
        });
    });

    app.listen(3000);
