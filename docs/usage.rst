Usage
=====

.. code-block:: javascript

    var raven = require('raven');
    var client = new raven.Client('___DSN___');

    client.captureMessage('Hello, world!');

Capturing Messages
------------------

.. code-block:: javascript

    Raven.captureMessage('Broken!')

Configuring the HTTP Transport
------------------------------

.. code-block:: javascript

    var client = new raven.Client('___DSN___', {
        transport: new raven.transports.HTTPSTransport({rejectUnauthorized: false})
    });

Optional Attributes
-------------------

All optional attributes are passed as part of the options to ``captureError`` and ``captureMessage``.

.. describe:: extra

    Additional context for this event. Must be a mapping. Children can be any native JSON type.

    .. code-block:: javascript

        {
            extra: {'key': 'value'}
        }

.. describe:: tags

    Tags to index with this event. Must be a mapping of strings.

    .. code-block:: javascript

        {
            tags: {'key': 'value'}
        }

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

Event IDs
---------

To make referencing an event easy (both by the developer and customer), you can grab
the event ID using a callback:


.. code-block:: javascript

    client.captureMessage('Hello, world!', function(result) {
        console.log(client.getIdent(result));
    });

.. code-block:: javascript

    client.captureError(new Error('Broke!'), function(result) {
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


Disable Raven
-------------

Passing any falsey value as the DSN will disable sending events upstream:

.. code-block:: javascript

    client = new raven.Client(process.env.NODE_ENV === 'production' && '___DSN___')
