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


Putting it all together
~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: html

    <!DOCTYPE html>
    <html>
    <head>
        <title>Awesome stuff happening here</title>
        <script src="//d3nslu0hdya83q.cloudfront.net/build/master/raven.min.js"></script>
        <script>Raven.config('https://public@getsentry.com/1').install()</script>
    </head>
    <body>
        ...
        <script src="jquery.min.js"></script>
        <script src="myapp.js"></script>
    </body>
    </html>
