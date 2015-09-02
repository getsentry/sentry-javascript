Configuration
=============

Configuration is passed as the second argument of the ``raven.Client`` constructor:

.. code-block:: javascript

    var raven = require("raven");

    new raven.Client(String dsn[, Object options])

Optional settings
-----------------

.. describe:: logger

    The name of the logger used by Sentry. Default: ``''``

    .. code-block:: javascript

        {
          logger: 'default'
        }

.. describe:: release

    Track the version of your application in Sentry.

    .. code-block:: javascript

        {
          release: '721e41770371db95eee98ca2707686226b993eda'
        }

.. describe:: dataCallback

    A function that allows mutation of the data payload right before being
    sent to Sentry.

    .. code-block:: javascript

        {
            dataCallback: function(data) {
                // remove references to the environment
                delete data.request.env;
                return data;
            }
        }

Environment Variables
---------------------

.. describe:: SENTRY_DSN

    Optionally declare the DSN to use for the client through the environment. Initializing the client in your app won't require setting the DSN.

.. describe:: SENTRY_NAME

    Optionally set the name for the client to use. [What is name?](http://raven.readthedocs.org/en/latest/config/index.html#name)

.. describe:: SENTRY_RELEASE

    Optionally set the application release version for the client to use, this is usually a Git SHA hash.
