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

.. describe:: environment

    Track the environment name inside Sentry.

    .. code-block:: javascript

        {
          environment: 'staging'
        }

.. describe:: tags

    Additional tags to assign to each event.

    .. code-block:: javascript

        {
          tags: {git_commit: 'c0deb10c4'}
        }

.. describe:: extra

    Arbitrary data to associate with the event.

    .. code-block:: javascript

        {
            extra: {planet: {name: 'Earth'}}
        }

.. describe:: dataCallback

    A function that allows mutation of the data payload right before being
    sent to Sentry.

    .. code-block:: javascript

        {
            dataCallback: function(data) {
                // add a user context
                data.user = {
                    id: 1337,
                    name: 'janedoe',
                    email: 'janedoe@example.com'
                };
                return data;
            }
        }

.. describe:: transport

    Override the default HTTP data transport handler.

    .. code-block:: javascript

        {
            transport: function (options) {
                // send data
            }
        }

    Please see the raven-node source code to see `how transports are implemented
    <https://github.com/getsentry/raven-node/blob/master/lib/transports.js>`__.

Environment Variables
---------------------

.. describe:: SENTRY_DSN

    Optionally declare the DSN to use for the client through the environment. Initializing the client in your app won't require setting the DSN.

.. describe:: SENTRY_NAME

    Optionally set the name for the client to use. `What is name?
    <http://raven.readthedocs.org/en/latest/config/index.html#name>`__

.. describe:: SENTRY_RELEASE

    Optionally set the application release version for the client to use, this is usually a Git SHA hash.

.. describe:: SENTRY_ENVIRONMENT

    Optionally set the environment name, e.g. "staging", "production".
