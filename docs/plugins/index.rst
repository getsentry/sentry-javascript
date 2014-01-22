Plugins
=======

What are plugins?
~~~~~~~~~~~~~~~~~

In Raven.js, plugins are little snippets of code to augment functionity for a specific application/framework. It is highly recommended to checkout the list of plugins and use what apply to your project.

In order to keep the core small, we have opted to only include the most basic functionality by default, and you can pick and choose which plugins are applicable for you.

Why are plugins needed at all?
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

JavaScript is pretty restrictive when it comes to exception handling, and there are a lot of things that make it difficult to get relevent information, so it's important that we inject code and wrap things magically so we can extract what we need. See :doc:`/usage/index` for tips regarding that.

Transport plugins
~~~~~~~~~~~~~~~~~
Transport plugins allow you to override how Raven sends the data into Sentry.
A transport is added based on the dsn passed into config, e.g `Raven.config('http://abc@example.com:80/2')` will use the transport registered for `http`.

The default transport plugin uses inserts an image thus generating a `GET` request to Sentry.
There is also a transport plugin available for `CORS XHR` in situations where the `Origin` and `Referer` headers won't get set properly for `GET` requests (e.g when the browser is executing from a `file://` URI).

Registering new transport plugins
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
New methods of transports can be added to Raven using

.. code-block:: javascript

    Raven.registerTransport('https+post', {
        /*
         * Configure the transport protocol using the provided config
         */
        setup: function(dsn){
            // snip
        },

        /*
         * Send the data to Sentry.
         */
        send: function(data, endpoint){
            // snip
        }
    });



All Plugins
~~~~~~~~~~~
* https://github.com/getsentry/raven-js/tree/master/plugins
* `Download <http://ravenjs.com>`_
