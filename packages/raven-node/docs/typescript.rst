.. _raven-node-typescript:

Source Maps
===========

Please read `Source Maps docs <https://docs.sentry.io/clients/node/sourcemaps/>`_ first to learn how to configure Raven SDK, upload artifacts to our servers or use Webpack (if you're willing to use `ts-loader` for your TypeScript compilation).

Using Raven and Source Maps with TypeScript unfortunatelly requires slightly more configuration.

There are two main reasons for this:

1) TypeScript compiles and outputs all files separately
2) SourceRoot is by default set to, well, source directory, which would require uploading artifacts from 2 separate directories and modification of source maps themselves

We can still make it work with two additional steps, so let's do this.

The first one is configuring TypeScript compiler in a way, in which we'll override `sourceRoot` and merge original sources with corresponding maps.
The former is not required, but it'll help Sentry display correct filepaths, eg. `/lib/utils/helper.ts` instead of a full one like `/Users/Sentry/Projects/TSExample/lib/utils/helper.ts`.
You can skip this option if you're fine with such a long names.

Assuming you already have a `tsconfig.json` file similar to this:

::

    {
        "compilerOptions": {
            "target": "es6",
            "module": "commonjs",
            "allowJs": true,
            "moduleResolution": "node",
            "outDir": "dist"
        },
        "include": [
            "./src/**/*"
        ]
    }

create a new one called `tsconfig.production.json` and paste the snippet below:

::

    {
        "extends": "./tsconfig",
        "compilerOptions": {
            "sourceMap": true,
            "inlineSources": true,
            "sourceRoot": "/"
        }
    }

From now on, when you want to run the production build, that'll be uploaded you specify this very config, eg. `tsc -p tsconfig.production.json`.
This will create necessary source maps and attach original sources to them instead of making us to upload them and modify source paths in our maps by hand.

The second step is changing events frames, so that Sentry can link stacktraces with correct source files.

This can be done using `dataCallback`, in a very similar manner as we do with a single entrypoint described in Source Maps docs, with one, very important difference.
Instead of using `basename`, we have to somehow detect and pass the root directory of our project.

Unfortunately, Node is very fragile in that manner and doesn't have a very reliable way to do this.
The easiest and the most reliable way we found, is to store the `__dirname` or `process.cwd()` in the global variable and using it in other places of your app.
This *has to be done* as the first thing in your code and from the entrypoint, otherwise the path will be incorrect.

If you want, you can set this value by hand to something like `/var/www/html/some-app` if you can get this from some external source or you know it won't ever change.

This can also be achieved by creating a separate file called `root.js` or similar that'll be placed in the same place as your entrypoint and exporting obtained value
instead of exporting it globally.

.. code-block:: javascript

    // index.js

    // This allows TypeScript to detect our global value
    declare global {
      namespace NodeJS {
        interface Global {
          __rootdir__: string;
        }
      }
    }

    global.__rootdir__ = __dirname || process.cwd();

.. code-block:: javascript

    import * as path from 'path';
    const root = global.__rootdir__;

    Raven.config('your-dsn', {
      // the rest of configuration

      dataCallback: function (data) {
        var stacktrace = data.exception && data.exception[0].stacktrace;

        if (stacktrace && stacktrace.frames) {
          stacktrace.frames.forEach(function(frame) {
            if (frame.filename.startsWith('/')) {
              frame.filename = "app:///" + path.relative(root, frame.filename);
            }
          });
        }

        return data;
      }
    ).install();

This config should be enough to make everything work and use TypeScript with Node and still being able to digest all original sources by Sentry.

