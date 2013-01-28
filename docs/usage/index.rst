Usage
=====

By default, Raven makes a few efforts to try it's best to capture meaningful stack traces, but browsers make it pretty difficult.

The easiest solution is to prevent an error from bubbling all of the way up the stack to ``window``.

How to actually capture an error correctly
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

try...catch
-----------

The simplest way, is to try and explicitly capture and report potentially problematic code with a ``try...catch`` block and ``Raven.captureException``.

.. code-block:: javascript

    try {
        doSomething(a[0])
    } catch(e) {
        Raven.captureException(e)
    }

context/wrap
------------

``Raven.context`` allows you to wrap any function to be immediately executed. Behind the scenes, Raven is just wrapping your code in a ``try...catch`` block.

.. code-block:: javascript

    Raven.context(function() {
        doSomething(a[0])
    })

``Raven.wrap`` wraps a function in a similar way to ``Raven.context``, but instead of executing the function, it returns another function. This is totally awesome for use when passing around a callback.

.. code-block:: javascript

    var doIt = function() {
        // doing cool stuff
    }

    setTimeout(Raven.wrap(doIt), 1000)

Tracking authenticated users
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

While a user is logged in, you can tell Sentry to associate errors with user data.

.. code-block:: javascript

    Raven.setUser({
        email: 'matt@example.com',
        id: '123'
    })

If at any point, the user becomes unauthenticated, you can call ``Raven.setUser()`` with no arguments to remove their data. *This would only really be useful in a large web app where the user logs in/out without a page reload.*

Capturing a specific message
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: javascript

    Raven.captureMessage('Broken!')

Passing additional data
~~~~~~~~~~~~~~~~~~~~~~~
``captureException``, ``context``, ``wrap``, and ``captureMessage`` functions all allow passing additional data to be tagged onto the error, such as ``tags``.

.. code-block:: javascript

    Raven.captureException(e, {tags: { key: "value" }})

    Raven.captureMessage('Broken!', {tags: { key: "value" }})

    Raven.context({tags: { key: "value" }}, function(){ ... })

    Raven.wrap({logger: "my.module"}, function(){ ... })


Dealing with minified source code
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Raven and Sentry now support `Source Maps <http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/>`_. *Information coming soon*
