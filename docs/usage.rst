Usage
=====

Capturing Errors
----------------

.. code-block:: javascript

    try {
        doSomething(a[0])
    } catch (err) {
        client.captureException(err)
    }

Capturing Messages
------------------

.. code-block:: javascript

    client.captureMessage('Broken!')

.. _raven-node-additional-context:

Optional Attributes
-------------------

All optional attributes are passed as part of the options to ``captureException`` and ``captureMessage``.

.. describe:: extra

    Additional context for this event. Must be a mapping. Children can be any native JSON type.

    .. code-block:: javascript

        {
            extra: {'key': 'value'}
        }

    You can also set extra data globally to be merged in with future events with ``setExtraContext``:

    .. code-block:: javascript

        client.setExtraContext({ foo: "bar" })

.. describe:: tags

    Tags to index with this event. Must be a mapping of strings.

    .. code-block:: javascript

        {
            tags: {'key': 'value'}
        }

    You can also set tags globally to be merged in with future exceptions events with ``setTagsContext``:

    .. code-block:: javascript

        client.setTagsContext({ key: "value" });

.. describe:: fingerprint

    The fingerprint for grouping this event.

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

Tracking Users
--------------

While a user is logged in, you can tell Sentry to associate errors with
user data.

.. code-block:: javascript

    client.setUserContext({
        email: 'matt@example.com',
        id: '123'
    })

If at any point, the user becomes unauthenticated, you can call
``client.setUserContext()`` with no arguments to remove their data. *This
would only really be useful in a large web app where the user logs in/out
without a page reload.*

This data is generally submitted with each error or message and allows you
to figure out which errors are affected by problems.

Event IDs
---------

To make referencing an event easy (both by the developer and customer), you can grab
the event ID using a callback:


.. code-block:: javascript

    client.captureMessage('Hello, world!', function(result) {
        console.log(client.getIdent(result));
    });

.. code-block:: javascript

    client.captureException(new Error('Broke!'), function(result) {
        console.log(client.getIdent(result));
    });


.. note::

    ``captureMessage`` will also return the result directly without the need for a callback,
    such as: ``var result = client.captureMessage('Hello, world!');``

Global Error Handler
--------------------

It is recommended that you install the global error handler, which will ensure any exceptions
that are unhandled will get reported:

.. code-block:: javascript

    client.patchGlobal();
    // or
    raven.patchGlobal(client);
    // or
    raven.patchGlobal('___DSN___');

Generally you don't want to leave the process running after receiving an
`uncaughtException` (http://nodejs.org/api/process.html#process_event_uncaughtexception),
so an optional callback is provided to allow you to hook in something like:

.. code-block:: javascript

    client.patchGlobal(function() {
        console.log('Bye, bye, world.');
        process.exit(1);
    });

The callback is called **after** the event has been sent to the Sentry server.

Events
------

If you really care if the event was logged or errored out, Client emits two events, `logged` and `error`:

.. code-block:: javascript

    client.on('logged', function(){
        console.log('Yay, it worked!');
    });

    client.on('error', function(e){
        // The event contains information about the failure:
        //   e.reason -- raw response body
        //   e.statusCode -- response status code
        //   e.response -- raw http response object

        console.log('uh oh, couldnt record the event');
    })

    client.captureMessage('Boom');

Configuring the HTTP Transport
------------------------------

.. code-block:: javascript

    var client = new raven.Client('___DSN___', {
        transport: new raven.transports.HTTPSTransport({rejectUnauthorized: false})
    });

Disable Raven
-------------

Passing any falsey value as the DSN will disable sending events upstream:

.. code-block:: javascript

    client = new raven.Client(process.env.NODE_ENV === 'production' && '___DSN___')
