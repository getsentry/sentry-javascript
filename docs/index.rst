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

Now need to configure your application:

.. code-block:: javascript

    var client = new raven.Client('___DSN___');

At this point you'll likely need to integrate it into your application via
middleware or another integration mechanism. Take a look at our documentation
on :doc:`integrations/index` and :doc:`usage`.

Reporting Errors
----------------

You'll want to start by injecting a global error handler, which will catch any
exceptions which would bubble up to the Node runtime:

.. code-block:: javascript

  client.patchGlobal();

Beyond that, the simplest way is to explicitly capture and report potentially
problematic code with a ``try...catch`` block and ``Raven.captureException``:

.. code-block:: javascript

    try {
        doSomething(a[0])
    } catch(e) {
        client.captureException(e)
    }

Deep Dive
---------

For more detailed information about how to get most out of Raven.js there
is additional documentation available that covers all the rest:

.. toctree::
   :maxdepth: 2
   :titlesonly:

   install
   config
   usage
   integrations/index
   coffeescript

Resources:

* `Bug Tracker <http://github.com/getsentry/raven-node/issues>`_
* `Github Project <http://github.com/getsentry/raven-node>`_
