.. sentry:edition:: self

    Raven.js
    ========

.. sentry:edition:: hosted, on-premise

    .. class:: platform-js

    JavaScript
    ==========

Raven.js is the official browser JavaScript client for Sentry. It automatically reports uncaught JavaScript exceptions
triggered from a browser environment, and provides a rich API for reporting your own errors.

**Note**: If you're using Node.js on the server, you'll need
`raven-node <https://docs.sentry.io/clients/node/>`_.

Installation
------------

The easiest way to load Raven.js is to load it directly from our CDN. This script tag should
be included after other libraries are loaded, but before your main application code (e.g. app.js):

.. sourcecode:: html

    <script src="https://cdn.ravenjs.com/###RAVEN_VERSION###/raven.min.js" crossorigin="anonymous"></script>

For installation using npm or other package managers, see :doc:`install`.

Configuring the Client
----------------------

Next you need to configure Raven.js to use your `Sentry DSN
<https://docs.sentry.io/hosted/quickstart/#configure-the-dsn>`_:

.. code-block:: javascript

    Raven.config('___PUBLIC_DSN___').install()

It is additionally recommended (but not required) to wrap your application start using `Raven.context`.
This can help surface additional errors in some execution contexts.

.. code-block:: javascript

    Raven.context(function () {
        initMyApp();
    });

At this point, Raven is ready to capture any uncaught exception.

Once you have Raven up and running, it is highly recommended to check out :doc:`config`
and :doc:`usage`.

Manually Reporting Errors
-------------------------

By default, Raven makes a best effort to capture any uncaught exception.

To report errors manually, wrap potentially problematic code with a ``try...catch``
block and call ``Raven.captureException``:

.. code-block:: javascript

    try {
        doSomething(a[0])
    } catch(e) {
        Raven.captureException(e)
    }

There are more ways to report errors.  For a complete guide on this see
:ref:`raven-js-reporting-errors`.

Adding Context
--------------

While a user is logged in, you can tell Sentry to associate errors with
user data.  This data is then submitted with each error which allows you
to figure out which users are affected.

.. code-block:: javascript

    Raven.setUserContext({
        email: 'matt@example.com',
        id: '123'
    })

If at any point, the user becomes unauthenticated, you can call
``Raven.setUserContext()`` with no arguments to remove their data.

Other similar methods are ``Raven.setExtraContext`` and
``Raven.setTagsContext`` as well as ``Raven.context``.  See
:ref:`raven-js-additional-context` for more info.

Breadcrumbs
-----------

Breadcrumbs are browser and application lifecycle events that are helpful in understanding the state of the application
leading up to a crash.

By default, Raven.js instruments browser built-ins and DOM events to automatically collect a few useful breadcrumbs
for you:

  * XMLHttpRequests
  * URL / address bar changes
  * UI clicks and keypress DOM events
  * console log statements
  * previous errors

You can also record your own breadcrumbs. For more information, see :ref:`raven-js-recording-breadcrumbs`.

Dealing with Minified Source Code
---------------------------------

Raven and Sentry support `Source Maps
<http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/>`_.  If
you provide source maps in addition to your minified files that data
becomes available in Sentry.  For more information see
:ref:`raven-js-sourcemaps`.

Browser Compatibility
---------------------

Raven.js supports all major browsers. In older browsers, error reports collected
by Raven.js may have a degraded level of detail – for example, missing stack trace data
or missing source code column numbers.

The table below describes what features are available in each supported browser:

+-------------------------+--------------+----------------+-------------+
| Browser                 | Line numbers | Column numbers | Stack trace |
+=========================+==============+================+=============+
| Chrome                  | ✓            | ✓              | ✓           |
+-------------------------+--------------+----------------+-------------+
| Firefox                 | ✓            | ✓              | ✓           |
+-------------------------+--------------+----------------+-------------+
| Edge                    | ✓            | ✓              | ✓           |
+-------------------------+--------------+----------------+-------------+
| IE 11                   | ✓            | ✓              | ✓           |
+-------------------------+--------------+----------------+-------------+
| IE 10                   | ✓            | ✓              | ✓           |
+-------------------------+--------------+----------------+-------------+
| IE 9                    | ✓            | ✓              |             |
+-------------------------+--------------+----------------+-------------+
| IE 8                    | ✓            |                |             |
+-------------------------+--------------+----------------+-------------+
| Safari 6+               | ✓            | ✓              | ✓           |
+-------------------------+--------------+----------------+-------------+
| iOS Safari 6+           | ✓            | ✓              | ✓           |
+-------------------------+--------------+----------------+-------------+
| Opera 15+               | ✓            | ✓              | ✓           |
+-------------------------+--------------+----------------+-------------+
| Android Browser 4.4     | ✓            | ✓              | ✓           |
+-------------------------+--------------+----------------+-------------+
| Android Browser 4 - 4.3 | ✓            |                |             |
+-------------------------+--------------+----------------+-------------+

For browsers with Web Worker support, Raven.js is designed to work inside a Web Worker context.

For unlisted browsers (e.g. IE7), Raven.js is designed to fail gracefully. Including
it on your page should have no effect on your page; it will just not collect
and report uncaught exceptions.

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
   sourcemaps
   tips

.. sentry:edition:: self

   Development info:

    .. toctree::
       :maxdepth: 2
       :titlesonly:

       contributing

Resources:

* `Downloads and CDN <http://ravenjs.com/>`_
* `Bug Tracker <http://github.com/getsentry/raven-js/issues>`_
* `Github Project <http://github.com/getsentry/raven-js>`_
