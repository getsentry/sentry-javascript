Redux
=====

Installation
------------

Start by adding the ``raven.js`` script tag to your page. It should be loaded as early as possible.

.. sourcecode:: html

    <script src="https://cdn.ravenjs.com/###RAVEN_VERSION###/raven.min.js"
        crossorigin="anonymous"></script>

Configuring the Client
----------------------

Next configure Raven.js to use your Sentry DSN:

.. code-block:: javascript

    Raven.config('___PUBLIC_DSN___').install()

At this point, Raven is ready to capture any uncaught exception.

Redux Middleware
----------------

Once Raven is installed it will capture exceptions raised within your redux
store, however it may be useful to include information such as the Redux action
or even current the current state tree.

There are a few useful community maintained packages to help with this:

- `ngokevin/redux-raven-middleware <https://github.com/ngokevin/redux-raven-middleware>`_
- `captbaritone/raven-for-redux <https://github.com/captbaritone/raven-for-redux>`_

Both packages provide a useful integration for Raven in Redux but take slightly
different approaches.

Redux Sagas Middleware
----------------------

`Redux Saga <https://github.com/redux-saga/redux-saga>`_ is a great way to
separate out actions that produce side effects from your pure reducers, however
due to it's "thread like model", exceptions raised from sagas do not bubble up
to the browser default exception handler.

Instrumenting a Redux Saga middleware for sentry is simple:

.. code-block:: javascript

    createSagaMiddleware({onError: function logException(ex) {
        Raven.captureException(ex);
    }});


Exceptions raised within your saga tasks will be now reported to Sentry.
