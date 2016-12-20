.. sentry:edition:: self

    raven-node
    ==========

.. sentry:edition:: hosted, on-premise

    .. class:: platform-node

    Node.js
    =======

raven-node is the official Node.js client for Sentry.

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

    var Raven = require('raven');
    Raven.config('___DSN___').install();

At this point, Raven is set up to capture and report any uncaught exceptions.

You can optionally pass an object of configuration options as the 2nd argument to `Raven.config`. For
more information, see :doc:`config`.

Reporting Errors
----------------

Raven's ``install`` method sets up a global handler to automatically capture any uncaught exceptions. You can also report errors manually with ``try...catch`` and
a call to ``captureException``:

.. code-block:: javascript

    try {
        doSomething(a[0]);
    } catch (e) {
        Raven.captureException(e);
    }

You can also use ``wrap`` and ``context`` to have Raven wrap a function and automatically capture any exceptions it throws:

.. code-block:: javascript

  Raven.context(function () {
    doSomething(a[0]);
  });

For more information on reporting errors, see :doc:`usage`.

Adding Context
--------------

Code run via ``wrap`` or ``context`` has an associated set of context data, and Raven provides methods for managing that data.

You'll most commonly use this to associate the current user with an exception:

.. code-block:: javascript

  Raven.context(function () {
    Raven.setContext({
      user: {
        email: 'matt@example.com',
        id: '123'
      }
    });
    // errors thrown here will be associated with matt
  });
  // errors thrown here will not be associated with matt

This can also be used to set ``tags`` and ``extra`` keys for associated tags and extra data.

You can update the context data with ``mergeContext`` or retrieve it with ``getContext``. When an exception is captured by a wrapper, the current context state will be passed as options to ``captureException``.

See :ref:`raven-node-additional-context` for more.

Breadcrumbs
-----------

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

Raven can be configured to automatically capture breadcrubs for certain events including:

  * http/https requests
  * console log statements
  * postgres queries

For more information, see :ref:`raven-recording-breadcrumbs`.

Middleware and Integrations
---------------------------

If you're using Node.js with a web server framework/library like Connect, Express, or Koa, it is recommended
to configure one of Raven's server middleware integrations. See :doc:`integrations/index`.

Deep Dive
---------

For more detailed information about how to get most out of Raven there
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
