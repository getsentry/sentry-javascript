AngularJS
=========

.. versionadded:: 1.3.0
   Prior to 1.3.0, we had an Angular plugin, but was undocumented. 1.3.0 comes with a rewritten version with better support.

Installation
------------

Start by adding the ``raven.js`` script tag to your page. It should go **before** your application code.

Example:

.. sourcecode:: html

    <script src="https://cdn.ravenjs.com/2.1.0/angular/raven.min.js"></script>

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

While adding ``ngRaven`` to your app will capture enable integration support, you'll still need
to wire up the SDK just as if you weren't using Angular. This should happen immediately **after** the JS SDK script tag:

.. code-block:: html

    <script src="https://cdn.ravenjs.com/2.1.0/angular/raven.min.js"></script>
    <script>
      Raven.config('___PUBLIC_DSN___').install();
    </script>

At this point the SDK will capture Angular-specific errors, as well as general JavaScript
issues that may happen outside of the scope of the framework.
