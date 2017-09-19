Loopback
=======

.. code-block:: javascript

    // server/middleware/sentry.js

    var Raven = require('raven');
    Raven.config('__DSN__').install();

    module.exports = function () {
      return Raven.errorHandler();
    }

.. code-block:: javascript

    // server/middleware.json

    "final": {
      "./middleware/sentry": {}
    }
