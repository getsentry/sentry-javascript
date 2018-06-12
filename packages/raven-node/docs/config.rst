Configuration
=============

To get started, you need to configure Raven to use your Sentry DSN:

.. sourcecode:: javascript

    var Raven = require('raven');
    Raven.config('___PUBLIC_DSN___').install();

At this point, Raven is ready to capture any uncaught exceptions.

Note that the ``install`` method can optionally take a callback function that is invoked if a fatal, non-recoverable error occurs.
You can use this callback to perform any cleanup that should occur before the Node process exits.

.. sourcecode:: javascript

    Raven.config('___PUBLIC_DSN___').install(function (err, initialErr, eventId) {
      console.error(err);
      process.exit(1);
    });

Optional settings
-----------------

``Raven.config()`` can optionally be passed an additional argument for extra configuration:

.. sourcecode:: javascript

    Raven.config('___PUBLIC_DSN___', {
      release: '1.3.0'
    }).install();

Those configuration options are documented below:

.. describe:: logger

    The name of the logger used by Sentry.

    .. code-block:: javascript

        {
          logger: 'default'
        }

.. describe:: name

    Set the server name for the client to use. Default: ``require('os').hostname()``
    Optionally, use ``SENTRY_NAME`` environment variable.

    .. code-block:: javascript

        {
          name: 'primary'
        }

.. describe:: release

    Track the version of your application in Sentry.
    Optionally, use ``SENTRY_RELEASE`` environment variable.

    .. code-block:: javascript

        {
          release: '721e41770371db95eee98ca2707686226b993eda'
        }

    This is usually a Git SHA hash, which can be obtained using various npm packages, e.g.

    .. code-block:: javascript

        var git = require('git-rev-sync');

        {
          // this will return 40 characters long hash
          // eg. '75bf4eea9aa1a7fd6505d0d0aa43105feafa92ef'
          release: git.long()
        }

.. describe:: environment

    Track the environment name inside Sentry.
    Optionally, use ``SENTRY_ENVIRONMENT`` environment variable.

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

.. describe:: parseUser

    Controls how Raven tries to parse user context when parsing a request object.

    An array of strings will serve as a whitelist for fields to grab from ``req.user``.
    ``true`` will collect all keys from ``req.user``. ``false`` will collect nothing.

    Defaults to ``['id', 'username', 'email']``.

    Alternatively, a function can be provided for fully custom parsing:

    .. code-block:: javascript

        {
            parseUser: function (req) {
                // custom user parsing logic
                return {
                    username: req.specialUserField.username,
                    id: req.specialUserField.getId()
                };
            }
        }

.. describe:: sampleRate

    A sampling rate to apply to events. A value of 0.0 will send no events,
    and a value of 1.0 will send all events (default).

    .. code-block:: javascript

        {
            sampleRate: 0.5 // send 50% of events, drop the other half
        }

.. describe:: sendTimeout

    The time to wait to connect to the server or receive a response when capturing an exception, in seconds.

    If it takes longer, the transport considers it a failed request and will pass back a timeout error.

    Defaults to 1 second. Make it longer if you run into timeout problems when sending exceptions to Sentry.

    .. code-block:: javascript

        {
            sendTimeout: 5 // wait 5 seconds before considering the capture to have failed
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

.. describe:: shouldSendCallback

    A callback function that allows you to apply your own filters to determine if the event should be sent to Sentry.

    .. code-block:: javascript

        {
            shouldSendCallback: function (data) {
                // randomly omit half of events
                return Math.random() > 0.5;
            }
        }

.. describe:: autoBreadcrumbs

  Enables/disables automatic collection of breadcrumbs. Possible values are:

  * `false` - all automatic breadcrumb collection disabled (default)
  * `true` - all automatic breadcrumb collection enabled
  * A dictionary of individual breadcrumb types that can be enabled/disabled:

  .. code-block:: javascript

      autoBreadcrumbs: {
          'console': false,  // console logging
          'http': true,     // http and https requests
      }

.. describe:: maxBreadcrumbs

  Raven captures up to 30 breadcrumb entries by default. You can increase this to
  be as high as 100, or reduce it if you find 30 is too noisy, by setting `maxBreadcrumbs`.

  Note that in very high-concurrency situations where you might have a large number of
  long-lived contexts each with a large number of associated breadcrumbs, there is potential
  for significant memory usage. 10,000 contexts with 10kB of breadcrumb data each will use
  around 120mB of memory. Most applications will be nowhere close to either of these numbers,
  but if yours might be, you can use the `maxBreadcrumbs` parameter to limit the amount of
  breadcrumb data each context will keep around.

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

.. describe:: maxReqQueueCount

  Controls how many requests can be maximally queued before bailing out and emitting an error. Defaults to `100`.

.. describe:: stacktrace

  Attach stack trace to `captureMessage` calls by generatic "synthetic" error object and extracting all frames.

Environment Variables
---------------------

.. describe:: SENTRY_DSN

    Optionally declare the DSN to use for the client through the environment. Initializing the client in your app won't require setting the DSN.

.. describe:: SENTRY_NAME

    Optionally set the server name for the client to use.

.. describe:: SENTRY_RELEASE

    Optionally set the application release version for the client to use, this is usually a Git SHA hash.

.. describe:: SENTRY_ENVIRONMENT

    Optionally set the environment name, e.g. "staging", "production". Sentry will default to the value of `NODE_ENV`, if present.
