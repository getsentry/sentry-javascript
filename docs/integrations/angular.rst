AngularJS
=========

.. versionadded:: 1.3.0
   Prior to 1.3.0, we had an Angular plugin, but was undocumented. 1.3.0 comes with a rewritten version with better support.

Installation
------------

Start by adding the ``raven.js`` script tag to your page. It should go **before** your application code.

Example:

.. sourcecode:: html

    <script src="https://cdn.ravenjs.com/1.3.0/angular,native/raven.min.js"></script>

    <!-- your application code below -->
    <script src="static/app.js"></script>

Additionally, inside your main Angular application module, you need to declare ``ngRaven`` as a
module dependency:

.. code-block:: javascript

    var myApp = angular.module('myApp', [
      'ngRaven',
      'ngRoute',
      'myAppControllers',
      'myAppFilters'
    ]);

Configuring the Client
----------------------

You need to configure raven.js to use your Sentry DSN. This should happen immediately after
your raven.js script include:

.. code-block:: html

    <script src="https://cdn.ravenjs.com/1.3.0/angular,native/raven.min.js"></script>
    <script>
      Raven.config('___PUBLIC_DSN___').install();
    </script>

At this point, Raven is ready to capture any uncaught exception via standard hooks
in addition to Backbone specific hooks.
