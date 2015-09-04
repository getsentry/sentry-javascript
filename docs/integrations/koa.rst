Koa
===

.. code-block:: javascript

    var koa = require('koa');
    var raven = require('raven');

    var app = koa();

    app.on('error', function(err) {
        raven.captureException(err);
    });

    app.listen(3000);
