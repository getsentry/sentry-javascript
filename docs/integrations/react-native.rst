React Native
============

.. sentry:support-warning::

    The React Native plugin is experimental, and not ready for production use.

 .. versionadded:: 1.3.0

Installation
------------

In the root of your React Native project, install raven-js via npm:

.. sourcecode:: bash

    $ npm install --save raven-js

At the top of your main application file (e.g. index.ios.js and/or index.android.js), add the following code:

.. sourcecode:: javascript

    var React = require('react');

    var Raven = require('raven-js');
    require('raven-js/plugins/react-native')(Raven);

Configuring the Client
----------------------

Now we need to set up Raven.js to use your Sentry DSN:

.. code-block:: javascript

    Raven
      .config('___PUBLIC_DSN___', { release: RELEASE_ID })
      .install();

RELEASE_ID is a string representing the “version” of the build you are
about to distribute. This can be the SHA of your Git repository’s HEAD. It
can also be a semantic version number (e.g. “1.1.2”), pulled from your
project’s package.json file. More below.

About Releases
--------------

Every time you build and distribute a new version of your React Native
app, you’ll want to create a new release inside Sentry.  This is for two
important reasons:

- You can associate errors tracked by Sentry with a particular build
- You can store your source maps generated for each build inside Sentry

Unlike a normal web application where your JavaScript files (and source
maps) are served and hosted from a web server, your React Native code is
being served from the target device’s filesystem. So you’ll need to upload
both your **source code** AND **source maps** directly to Sentry, so that
we can generate handy stack traces for you to browse when examining
exceptions trigged by your application.


Generating source maps
-----------------------

To generate source maps for your project, first start the `React Native Packager`_:

.. _React Native Packager: https://github.com/facebook/react-native/tree/master/packager#react-native-packager

.. code-block:: bash

    $ npm start

Then, in another tab, curl the packager service for your source map:

.. code-block:: bash

    $ curl http://127.0.0.1:8081/index.ios.map -o index.ios.map

This will write a file index.ios.map to the current directory.

Lastly, you'll need to `create a new release and upload your source code files and source maps as release artifact
<https://docs.getsentry.com/hosted/clients/javascript/sourcemaps/#uploading-source-maps-to-sentry>`__.

Expanded Usage
--------------

It's likely you'll end up in situations where you want to gracefully
handle errors. A good pattern for this would be to setup a logError helper:

.. code-block:: javascript

    function logException(ex, context) {
      Raven.captureException(ex, {
        extra: context
      });
      /*eslint no-console:0*/
      window.console && console.error && console.error(ex);
    }

Now in your components (or anywhere else), you can fail gracefully:

.. code-block:: javascript

    var Component = React.createClass({
        render() {
            try {
                // ..
            } catch (ex) {
                logException(ex);
            }
        }
    });
