Koa
===

.. code-block:: javascript

    var koa = require('koa');
    var raven = require('raven');

    var app = koa();
    var sentry = new raven.Client('___DSN___');

    app.on('error', function(err) {
        sentry.captureException(err);
    });

    app.listen(3000);
