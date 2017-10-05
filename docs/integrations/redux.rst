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
``````````````````````

If you're using `Redux Saga <https://github.com/redux-saga/redux-saga>`_ be
aware that it does not bubble errors up to the browsers uncaught exception
handler.

You may specify an error handler that captures saga exceptions by passing an
``onError`` function to the ``createSagaMiddleware`` options. See the `Redux
Saga documentation
<https://redux-saga.js.org/docs/api/#createsagamiddlewareoptions>`_ for more
details.
