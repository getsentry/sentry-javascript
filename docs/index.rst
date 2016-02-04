.. sentry:edition:: self

    raven-node
    ==========

.. sentry:edition:: hosted, on-premise

    .. class:: platform-node

    Node.js
    =======

raven-node is a Sentry's officially supported Node.js SDK.

**Note**: If you're using JavaScript in the browser, you'll need
`raven-js <https://github.com/getsentry/raven-js>`_.

Installation
------------

Raven is distributed via ``npm``:

.. code-block:: bash

    $ npm install raven --save

Configuring the Client
----------------------

Next you need to initialize the Raven client and configure it to use your `Sentry DSN
<https://docs.getsentry.com/hosted/quickstart/#configure-the-dsn>`_:

.. code-block:: javascript

    var raven = require('raven');
    var client = new raven.Client('___DSN___');

You can optionally pass an object of configuration options as the 2nd argument to `Client`. For
more information, see :doc:`config`.

Reporting Errors
----------------

To get started passing errors to Raven, it is recommended to initialize Raven's global error handler using
``patchGlobal``. This will cause any uncaught exception which would bubble up to the Node runtime to be
captured and processed by Raven.

.. code-block:: javascript

  client.patchGlobal();

Additionally, you can manually capture and report potentially problematic code with ``try...catch`` and
 ``captureException``:

.. code-block:: javascript

    try {
        doSomething(a[0])
    } catch(e) {
        client.captureException(e)
    }

The ``captureException`` method optionally takes an object of configuration options as the 2nd argument. For more information, and to learn about other methods provided by the Raven API, see :doc:`usage`.

Adding Context
--------------

While a user is logged in, you can tell Sentry to associate errors with
user data.  This data is then submitted with each error which allows you
to figure out which users are affected.

.. code-block:: javascript

    client.setUserContext({
        email: 'matt@example.com',
        id: '123'
    })

If at any point, the user becomes unauthenticated, you can call
``client.setUserContext()`` with no arguments to remove their data.

Other similar methods are ``client.setExtraContext`` and
``client.setTagsContext``.  See :ref:`raven-node-additional-context` for more info.

Middleware and Integrations
---------------------------

If you're using Node.js with a web server framework/library like Connect, Express, or Koa, it is recommended
to configure one of Raven's server middleware integrations. See doc:`integrations/index`.

Deep Dive
---------

For more detailed information about how to get most out of Raven.js there
is additional documentation available that covers all the rest:

.. toctree::
   :maxdepth: 2
   :titlesonly:

   config
   usage
   integrations/index
   coffeescript

Resources:

* `Bug Tracker <http://github.com/getsentry/raven-node/issues>`_
* `Github Project <http://github.com/getsentry/raven-node>`_
