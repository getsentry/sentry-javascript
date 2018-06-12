Sails
=====

.. code-block:: javascript

    // config/http.js

    var Raven = require('raven');
    Raven.config('__DSN__').install();

    module.exports.http = {
      middleware: {
        // Raven's handlers has to be added as a keys to http.middleware config object
        requestHandler: Raven.requestHandler(),
        errorHandler: Raven.errorHandler(),

        // And they have to be added in a correct order to middlewares list
        order: [
          // The request handler must be the very first one
          'requestHandler',
          // ...more middlewares
          'router',
          // The error handler must be after router, but before any other error middleware
          'errorHandler',
          /// ...remaining middlewares
        ]
      }
    }


