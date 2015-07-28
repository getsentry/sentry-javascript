Usage
=====

By default, Raven makes a few efforts to try its best to capture
meaningful stack traces, but browsers make it pretty difficult.

The easiest solution is to prevent an error from bubbling all of the way
up the stack to ``window``.

.. _raven-js-reporting-errors:

Reporting Errors Correctly
--------------------------

There are different methods to report errors and this all depends a little
bit on circumstances.

try … catch
```````````

The simplest way, is to try and explicitly capture and report potentially
problematic code with a ``try...catch`` block and
``Raven.captureException``.

.. code-block:: javascript

    try {
        doSomething(a[0])
    } catch(e) {
        Raven.captureException(e)
    }

**Do not** throw strings! Always throw an actual ``Error`` object. For
example:

.. code-block:: javascript

    throw new Error('broken')  // good
    throw 'broken'  // bad

It's impossible to retrieve a stack trace from a string. If this happens,
Raven transmits the error as a plain message.

context/wrap
````````````

``Raven.context`` allows you to wrap any function to be immediately
executed.  Behind the scenes, Raven is just wrapping your code in a
``try...catch`` block to record the exception before re-throwing it.

.. code-block:: javascript

    Raven.context(function() {
        doSomething(a[0])
    })

``Raven.wrap`` wraps a function in a similar way to ``Raven.context``, but
instead of executing the function, it returns another function.  This is
especially useful when passing around a callback.

.. code-block:: javascript

    var doIt = function() {
        // doing cool stuff
    }

    setTimeout(Raven.wrap(doIt), 1000)

Tracking Users
--------------

While a user is logged in, you can tell Sentry to associate errors with
user data.

.. code-block:: javascript

    Raven.setUserContext({
        email: 'matt@example.com',
        id: '123'
    })

If at any point, the user becomes unauthenticated, you can call
``Raven.setUserContext()`` with no arguments to remove their data. *This
would only really be useful in a large web app where the user logs in/out
without a page reload.*

This data is generally submitted with each error or message and allows you
to figure out which errors are affected by problems.

Capturing Messages
------------------

.. code-block:: javascript

    Raven.captureMessage('Broken!')

.. _raven-js-additional-context:

Passing Additional Data
-----------------------

``captureException``, ``context``, ``wrap``, and ``captureMessage``
functions all allow passing additional data to be tagged onto the error,
such as ``tags`` or ``extra`` for additional context.

.. code-block:: javascript

    Raven.captureException(e, {tags: { key: "value" }})

    Raven.captureMessage('Broken!', {tags: { key: "value" }})

    Raven.context({tags: { key: "value" }}, function(){ ... })

    Raven.wrap({logger: "my.module"}, function(){ ... })

    Raven.captureException(e, {extra: { foo: "bar" }})

You can also set context variables globally to be merged in with future
exceptions with ``setExtraContext`` and ``setTagsContext``.

.. code-block:: javascript

    Raven.setExtraContext({ foo: "bar" })
    Raven.setTagsContext({ key: "value" })


Getting Back an Event ID
------------------------

An event id is a globally unique id for the event that was just sent. This
event id can be used to find the exact event from within Sentry.

This is often used to display for the user and report an error to customer
service.

.. code-block:: javascript

    Raven.lastEventId()

``Raven.lastEventId()`` will be undefined until an event is sent. After an
event is sent, it will contain the string id.

.. code-block:: javascript

    Raven.captureMessage('Broken!')
    alert(Raven.lastEventId())


Verify Raven Setup
------------------

If you need to conditionally check if raven needs to be initialized or
not, you can use the `isSetup` function.  It will return `true` if Raven
is already initialized:

.. code-block:: javascript

    Raven.isSetup()


.. _raven-js-source-maps:

Dealing with Minified Source Code
---------------------------------

Raven and Sentry support `Source Maps
<http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/>`_.

We have provided some instructions to creating Source Maps over at
https://www.getsentry.com/docs/sourcemaps/. Also, checkout our `Gruntfile
<https://github.com/getsentry/raven-js/blob/master/Gruntfile.js>`_ for a
good example of what we're doing.

You can use `Source Map Validator
<http://sourcemap-validator.herokuapp.com/>`_ to help verify that things
are correct.

CORS
----

If you're hosting your scripts on another domain and things don't get
caught by Raven, it's likely that the error will bubble up to
``window.onerror``. If this happens, the error will report some ugly
``Script error`` and Raven will drop it on the floor since this is a
useless error for everybody.

To help mitigate this, we can tell the browser that these scripts are safe
and we're allowing them to expose their errors to us.

In your ``<script>`` tag, specify the ``crossorigin`` attribute:

.. code-block:: html

    <script src="//cdn.example.com/script.js" crossorigin="anonymous"></script>

And set an ``Access-Control-Allow-Origin`` HTTP header on that file.

.. code-block:: console

  Access-Control-Allow-Origin: *

.. note:: both of these steps need to be done or your scripts might not
   even get executed

Custom Grouping Behavior
------------------------

In some cases you may see issues where Sentry groups multiple events together
when they should be separate entities. In other cases, Sentry simply doesn't
group events together because they're so sporadic that they never look the same.

Both of these problems can be addressed by specifying the ``fingerprint``
attribute.

For example, if you have HTTP 404 (page not found) errors, and you'd prefer they
deduplicate by taking into account the URL:

.. code-block:: javascript

    Raven.captureException(ex, {fingerprint: ['{{ default }}', 'http://my-url/']});

.. sentry:edition:: hosted, on-premise

    For more information, see :ref:`custom-grouping`.
