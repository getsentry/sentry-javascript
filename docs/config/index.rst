Configuration
=============

We must first configure Sentry to allow certain hosts to report errors. This prevents abuse so somebody else couldn't start sending errors to your account from their site.

This can be found under the *Project Details* page in Sentry.

.. image:: http://i.imgur.com/S09MeSM.png

Now need to set up Raven.js to use your Sentry DSN.

.. code-block:: javascript

    Raven.config('https://public@getsentry.com/1').install()

At this point, Raven is ready to capture any uncaught exception.

Although, this technically works, this is not going to yield the greatest results. It's highly recommended to next check out :doc:`/usage/index`.

Optional settings
~~~~~~~~~~~~~~~~~

``Raven.config()`` can be passed an optional object for extra configuration.

logger
------

The name of the logger used by Sentry. Default: ``javascript``

.. code-block:: javascript

    {
      logger: 'javascript'
    }

ignoreErrors
------------

Very often, you will come across specific errors that are a result of something other than your application, or errors that you're completely not interested in. `ignoreErrors` is a list of these messages to be fitlered out before being sent to Sentry.

.. code-block:: javascript

    {
      ignoreErrors: ['fb_xd_fragment']
    }

ignoreUrls
----------

Similar to ``ignoreErrors``, but will ignore errors from whole urls patching a regex pattern.

.. code-block:: javascript

    {
      ignoreUrls: [/graph\.facebook\.com/i]
    }

Putting it all together
~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: html

    <!DOCTYPE html>
    <html>
    <head>
        <title>Awesome stuff happening here</title>
        <script src="//d3nslu0hdya83q.cloudfront.net/dist/1.0/raven.min.js"></script>
        <script>
            var options = {
                logger: 'my-logger',
                ignoreUrls: [
                    /graph\.facebook\.com/i
                ],
                ignoreErrors: [
                    'fb_xd_fragment'
                ]
            };
            Raven.config('https://public@getsentry.com/1', options).install();
        </script>
    </head>
    <body>
        ...
        <script src="jquery.min.js"></script>
        <script src="myapp.js"></script>
    </body>
    </html>
