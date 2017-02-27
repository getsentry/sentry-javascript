Usage
=====

Capturing Errors
----------------

You can use ``captureException`` to manually report errors:

.. code-block:: javascript

  try {
    throw new Error();
  } catch (e) {
    // You can get eventId either as the synchronous return value, or via the callback
    var eventId = Raven.captureException(e, function (sendErr, eventId) {
      // This callback fires once the report has been sent to Sentry
      if (sendErr) {
        console.error('Failed to send captured exception to Sentry');
      } else {
        console.log('Captured exception and send to Sentry successfully');
      }
    });
  }

The recommended usage pattern, though, is to run your entire program inside a Raven context:

.. code-block:: javascript

  var Raven = require('raven');

  Raven.config('___DSN___').install();
  Raven.context(function () {
    // all your stuff goes here
  });

Raven will automatically catch and report any unhandled errors originating inside this function
(or anything it calls, etc), so you don't have to manually `captureException` everywhere. This
also gives your code access to context methods. See below for more on contexts.

.. _raven-node-additional-context:

context/wrap
------------

``Raven.context`` allows you to wrap any function to be immediately
executed. Behind the scenes, this uses `domains <https://nodejs.org/api/domain.html>`__ to wrap, catch, and record any exceptions originating from the function.

.. code-block:: javascript

    Raven.context(function () {
        doSomething(a[0])
    });

``Raven.wrap`` wraps a function in a similar way to ``Raven.context``, but
instead of invoking the function, it returns another function.  This is
especially useful when passing around a callback.

.. code-block:: javascript

    var doIt = function () {
        // doing cool stuff
    }

    setTimeout(Raven.wrap(doIt), 1000)

We refer to code wrapped via ``Raven.context`` or ``Raven.wrap`` as being inside a context. Code inside a context
has access to the ``setContext``, ``mergeContext``, and ``getContext`` methods for associating data with that context.

.. code-block:: javascript

  Raven.setContext({
    user: {
      username: 'lewis'
    }
  });

  Raven.mergeContext({
    tags: {
      component: 'api'
    }
  });

  console.log(Raven.getContext());
  // { user: ..., tags: ... }

A context most commonly corresponds to a request; if you're using our Express middleware, each request is automatically
wrapped in its own context, so you can use Raven's context methods from inside any of your middleware or handlers.
A context might also correspond to, say, a connection lifecycle or a job being handled in a worker process.

Notable keys that you might set include ``user``, ``tags``, and ``extra``.
These types of extra context data are detailed more under :ref:`raven-node-additional-data`.

Tracking Users
--------------

While a user is logged in, you can tell Sentry to associate errors with
user data. This is really just a particular use of the context methods described above:

.. code-block:: javascript

    Raven.setContext({
      user: {
        email: 'matt@example.com',
        id: '123'
      }
    });

This data is then included with any errors or messages, allowing you to see which users are affected by problems.

Capturing Messages
------------------

.. code-block:: javascript

    client.captureMessage('Broken!', function (err, eventId) {
        // The message has now been sent to Sentry
    });


.. _raven-node-additional-data:

Additional Data
---------------

All optional attributes are passed as part of the options to ``captureException`` and ``captureMessage``.

.. describe:: user

    User context for this event. Must be a mapping. Children can be any native JSON type.

    .. code-block:: javascript

        {
            user: { name: 'matt' }
        }

    If you're inside a context and your context data includes a `user` key, that data will be merged into this.

.. describe:: tags

    Tags to index with this event. Must be a mapping of strings.

    .. code-block:: javascript

        {
            tags: { key: 'value' }
        }

    If you're inside a context and your context data includes a `tags` key, that data will be merged into this.
    You can also set tags data globally to be merged with all events by passing a ``tags`` option to ``config``.

.. describe:: extra

    Additional context for this event. Must be a mapping. Children can be any native JSON type.

    .. code-block:: javascript

        {
            extra: { key: 'value' }
        }

    If you're inside a context and your context data includes an `extra` key, that data will be merged into this.
    You can also set extra data globally to be merged with all events by passing an ``extra`` option to ``config``.


.. describe:: fingerprint

    The fingerprint for grouping this event. Learn more how `Sentry groups errors <https://docs.sentry.io/learn/rollups/>`__.

    .. code-block:: javascript

        {
            // dont group events from the same NODE_ENV together
            fingerprint: ['{{ default }}', process.env.NODE_ENV]
        }

.. describe:: level

    The level of the event. Defaults to ``error``.

    .. code-block:: javascript

        {
            level: 'warning'
        }

    Sentry is aware of the following levels:

    * debug (the least serious)
    * info
    * warning
    * error
    * fatal (the most serious)

.. _raven-recording-breadcrumbs:

Recording Breadcrumbs
---------------------

Breadcrumbs are records of server and application lifecycle events that can be helpful in understanding the state of the application leading up to a crash.

We can capture breadcrumbs and associate them with a context, and then send them along with any errors captured from that context:

.. code-block:: javascript

  Raven.context(function () {
    Raven.captureBreadcrumb({
      message: 'Received payment confirmation',
      category: 'payment',
      data: {
         amount: 312,
      }
    });
    // errors thrown here will have breadcrumb attached
  });

To learn more about what types of data can be collected via breadcrumbs, see the `breadcrumbs client API specification
<https://docs.sentry.io/learn/breadcrumbs/>`_.

Raven can be configured to automatically capture breadcrubs for certain events including:

  * http/https requests
  * console log statements
  * postgres queries

Automatic breadcrumb collection is disabled by default. You can enable it with a config option:

.. code-block:: javascript

  Raven.config('___PUBLIC_DSN___', {
    autoBreadcrumbs: true
  });

Or just enable specific types of automatic breadcrumbs:

.. code-block:: javascript

  Raven.config('___PUBLIC_DSN___', {
    autoBreadcrumbs: {
      http: true
    }
  });

For more on configuring breadcrumbs, see :doc:`config`.

Event IDs
---------

To make referencing an event easy (both by the developer and customer), you can
get an event ID from any captured message or exception. It's provided both as the
synchronous return value of the capture method and as an argument to the callback:

.. code-block:: javascript

  var eventId = Raven.captureException(e, function (sendErr, eventId2) {
    // eventId === eventId2
  });

Promises
--------

By default, Raven does not capture unhandled promise rejections. You can have it do so automatically:

.. code-block:: javascript

  Raven.config('___DSN___', {
    captureUnhandledRejections: true
  }).install();

Global Error Handler
--------------------

The ``install`` method sets up a global listener for uncaught exceptions, and possibly
also for unhandled rejections. You generally shouldn't carry on after receiving an `uncaughtException`
(see `Node docs <http://nodejs.org/api/process.html#process_event_uncaughtexception>`_),
so you can provide a callback which will be invoked **after** Raven has sent the event to Sentry:

.. code-block:: javascript

    Raven.install(function() {
      console.log('This is thy sheath; there rust, and let me die.');
      process.exit(1);
    });

Events
------

If you want to know if an event was logged or errored out, Raven instances emit two events, `logged` and `error`:

.. code-block:: javascript

    Raven.on('logged', function () {
      console.log('Yay, it worked!');
    });

    Raven.on('error', function (e) {
      // The event contains information about the failure:
      //   e.reason -- raw response body
      //   e.statusCode -- response status code
      //   e.response -- raw http response object

      console.log('uh oh, couldnt record the event');
    });

    Raven.captureMessage('Boom');

Configuring the HTTP Transport
------------------------------

.. code-block:: javascript

    Raven.config('___DSN___', {
      transport: new raven.transports.HTTPSTransport({rejectUnauthorized: false})
    });

Disable Raven
-------------

Passing any falsey value as the DSN will disable sending events upstream:

.. code-block:: javascript

  Raven.config(process.env.NODE_ENV === 'production' && '___DSN___');

Disable Console Alerts
----------------------
Raven will print console alerts in situations where you're using a deprecated API
or where behavior might be surprising, like if there's no DSN configured.

These alerts are hopefully helpful during initial setup or in upgrading Raven versions,
but once you have everything set up and going, we recommend disabling them:

.. code-block:: javascript

  Raven.disableConsoleAlerts();

Multiple Instances
------------------
Normally there is just one instance of Raven:

.. code-block:: javascript

  var Raven = require('raven');
  // Raven is already a Raven instance, and we do everything based on that instance

This should be sufficient for almost all users, but for various reasons some users might like to have multiple instances.
Additional instances can be created like this:

.. code-block:: javascript

  var Raven2 = new Raven.Client();
