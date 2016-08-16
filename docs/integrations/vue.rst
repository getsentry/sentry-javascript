Vue.js (2.0)
============

To use Sentry with your Vue application, you will need to use both Raven.js (Sentry's browser JavaScript SDK) and the Raven.js Vue plugin.

On its own, Raven.js will report any uncaught exceptions triggered from your application. For advanced usage examples of Raven.js, please read :doc:`Raven.js usage <../usage>`.

Additionally, the Raven.js Vue plugin will capture the name and props state of the active component where the error was thrown. This is reported via Vue's `config.errorHandler` hook.

Installation
------------

Raven.js and the Raven.js Vue plugin are distributed using a few different methods.

Using our CDN
~~~~~~~~~~~~~

For convenience, our CDN serves a single, minified JavaScript file containing both Raven.js and the Raven.js Vue plugin. It should be included **after** Vue, but **before** your application code.

Example:

.. sourcecode:: html

    <script src="http://builds.emberjs.com/tags/v2.3.1/ember.prod.js"></script>
    <script src="https://cdn.ravenjs.com/3.4.1/vue/raven.min.js"></script>
    <script>Raven.config('___PUBLIC_DSN___').install();</script>

Note that this CDN build auto-initializes the Vue plugin.

Using package managers
~~~~~~~~~~~~~~~~~~~~~~

Pre-built distributions of Raven.js and the Raven.js Vue plugin are available via both Bower and npm for importing in your ``ember-cli-build.js`` file.

Bower
`````

.. code

.. code-block:: sh

    $ bower install raven-js --save

.. code-block:: javascript

    app.import('bower_components/raven-js/dist/raven.js');
    app.import('bower_components/raven-js/dist/plugins/vue.js');

.. code-block:: html

    <script src="assets/vendor.js"></script>
    <script>
      Raven
        .config('___PUBLIC_DSN___')
        .addPlugin(Raven.Plugins.Vue)
        .install();
    </script>
    <script src="assets/your-app.js"></script>

npm
````

.. code-block:: sh

    $ npm install raven-js --save

.. code-block:: javascript

    app.import('bower_components/raven-js/dist/raven.js');
    app.import('bower_components/raven-js/dist/plugins/vue.js');

.. code-block:: html

    <script src="assets/vendor.js"></script>
    <script>
      Raven
        .config('___PUBLIC_DSN___')
        .addPlugin(Raven.Plugins.Vue)
        .install();
    </script>
    <script src="assets/your-app.js"></script>

These examples assume that Vue is exported globally as ``window.Vue``. You can alternatively pass a reference to the ``Vue`` object directly as the second argument to ``addPlugin``:

.. code-block:: javascript

    Raven.addPlugin(Raven.Plugins.Vue, Vue);
