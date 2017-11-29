Electron
========

To use Sentry with your Electron application, you will need to use both Raven.js SDKs, one for Browser and one for Node.js.
Browser SDK is used to report all errors from Electron's ``renderer process``, while Node.js is used to report ``main process`` errors.

On its own, Raven.js will report any uncaught exceptions triggered from your application. For advanced usage examples of Raven.js, please read :doc:`Raven.js usage <../usage>`.

Installation
------------

Both packages are available via npm.

.. code-block:: sh

    $ npm install raven raven-js --save

Configuring the Client
----------------------

First, let's configure ``main process``, which uses the Node.js SDK:

.. code-block:: javascript

    var Raven = require('raven');

    Raven.config('___PUBLIC_DSN___', {
      captureUnhandledRejections: true
    }).install();

And now ``renderer process``, which uses the Browser SDK:

.. code-block:: javascript

    var Raven = require('raven-js');
    Raven.config('___PUBLIC_DSN___').install();

    window.addEventListener('unhandledrejection', function (event) {
        Raven.captureException(event.reason);
    });

This configuration will also take care of unhandled Promise rejections, which can be handled in various ways. By default, Electron uses standard JS API.
To learn more about handling promises, refer to :ref:`raven-js-promises` documentation.

Sending environment information
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

It's often a good idea to send platform information along with a caught error.
Some things that we can easily add, but are not limited to, are:

- Environment type (browser/renderer)
- Electron version
- Chrome version
- Operation System type
- Operation System release

You can configure both processes in the same way. To do this, require the standard Node.js module `os` and add a `tags` attribute to your `config` call:

.. code-block:: javascript

    var os = require('os');
    var Raven = require('raven');

    Raven.config('___PUBLIC_DSN___', {
      captureUnhandledRejections: true,
      tags: {
        process: process.type,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        platform: os.platform(),
        platform_release: os.release()
      }
    }).install();
