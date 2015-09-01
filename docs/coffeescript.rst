CoffeeScript
============

In order to use raven-node with coffee-script or another library which overwrites
Error.prepareStackTrace you might run into the exception "Traceback does not
support Error.prepareStackTrace being defined already."

In order to not have raven-node (and the underlying raw-stacktrace library) require
Traceback you can pass your own stackFunction in the options. For example:

.. code-block:: coffeescript

    client = new raven.Client('___DSN___', {
        stackFunction: {{ Your stack function }}
    });


So for example:

.. code-block:: coffeescript

    client = new raven.Client('___DSN___', {
        stackFunction: Error.prepareStackTrace
    });
