.. sentry:edition:: self

    Raven.js
    ========

.. sentry:edition:: hosted, on-premise

    .. class:: platform-js

    JavaScript
    ==========

Raven.js is a tiny standalone JavaScript client for Sentry. It can be
used to report errors from a web browser. The quality of reporting will
heavily depend on the environment the data is submitted from.

**Note**: If you're using Node on the server, you'll need
`raven-node <https://github.com/getsentry/raven-node>`_.

Installation
------------

Raven.js is distributed in a few different methods, and should get
included after any other libraries are included, but before your own
scripts.  For all details see :doc:`install`.

.. sourcecode:: html

    <script src="https://cdn.ravenjs.com/1.3.0/jquery,native/raven.min.js"></script>

Configuring the Project
-----------------------

We must first configure Sentry to allow certain hosts to report errors.
This prevents abuse so somebody else couldn't start sending errors to your
account from their site.

This can be found under the **Project Settings** page in Sentry. You'll need
to add each domain that you plan to report from into the **Allowed Domains**
box. Alternatively if you're not worried about CORS security, you can simply
enter ``*`` to whitelist all domains.

Configuring the Client
----------------------

Now need to set up Raven.js to use your Sentry DSN:

.. code-block:: javascript

    Raven.config('___PUBLIC_DSN___').install()

At this point, Raven is ready to capture any uncaught exception.

Although, this technically works, this is not going to yield the greatest
results.  It's highly recommended to next check out :doc:`config` and
:doc:`usage` after you have it up and running to improve your results.

Reporting Errors
----------------

The simplest way, is to try and explicitly capture and report potentially
problematic code with a ``try...catch`` block and
``Raven.captureException``.

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

Dealing with Minified Source Code
---------------------------------

Raven and Sentry support `Source Maps
<http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/>`_.  If
you provide source maps in addition to your minified files that data
becomes available in Sentry.  For more information see
:ref:`raven-js-sourcemaps`.

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
