<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for SvelteKit

[![npm version](https://img.shields.io/npm/v/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)
[![npm dm](https://img.shields.io/npm/dm/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)
[![npm dt](https://img.shields.io/npm/dt/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/sveltekit/)

## Compatibility

The minimum supported version of SvelteKit is `1.0.0`. The SDK works best with Vite 4.2 and newer. Older Vite versions
might not generate source maps correctly.

The SDK supports the following SvelteKit adapters:

- `@sveltejs/adapter-auto` - for Vercel with the Node runtime. Other deployment targets might work but we don't
  guarantee compatibility.
- `@sveltejs/adapter-vercel` - only for Node (Lambda) runtimes, not yet Vercel's edge runtime
- `@sveltejs/adapter-node`

If you use the SDK with other adapters, we cannot guarantee that everything works as expected. You might need to
[manually configure source maps upload](#-configuring-source-maps-upload). The SDK is currently not compatible with
none-Node server runtimes, such as Vercel's Edge runtime or Cloudflare workers.

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/svelte` for the client side, with added
functionality related to SvelteKit.

## Automatic Setup

We recommend installing the SDK by running the
[Sentry wizard](https://docs.sentry.io/platforms/javascript/guides/sveltekit/#install) in the root directory of your
project:

```sh
npx @sentry/wizard@latest -i sveltekit
```

Take a look at the sections below if you want to customize your SDK configuration.

## Manual Setup

If the setup through the wizard doesn't work for you, you can also set up the SDK manually.

### 1. Prerequesits & Installation

1. Install the Sentry SvelteKit SDK:

   ```bash
   # Using npm
   npm install @sentry/sveltekit

   # Using yarn
   yarn add @sentry/sveltekit
   ```

### 2. Client-side Setup

The Sentry SvelteKit SDK mostly relies on [SvelteKit Hooks](https://kit.svelte.dev/docs/hooks) to capture error and
performance data.

1. If you don't already have a client hooks file, create a new one in `src/hooks.client.(js|ts)`.

2. On the top of your `hooks.client.(js|ts)` file, initialize the Sentry SDK:

   ```javascript
   // hooks.client.(js|ts)
   import * as Sentry from '@sentry/sveltekit';

   Sentry.init({
     dsn: '__DSN__',
     tracesSampleRate: 1.0,
     // For instance, initialize Session Replay:
     replaysSessionSampleRate: 0.1,
     replaysOnErrorSampleRate: 1.0,
     integrations: [Sentry.replayIntegration()],
   });
   ```

3. Add our `handleErrorWithSentry` function to the `handleError` hook:

   ```javascript
   // hooks.client.(js|ts)
   import { handleErrorWithSentry } from '@sentry/sveltekit';

   const myErrorHandler = ({ error, event }) => {
     console.error('An error occurred on the client side:', error, event);
   };

   export const handleError = handleErrorWithSentry(myErrorHandler);
   // or alternatively, if you don't have a custom error handler:
   // export const handleError = handleErrorWithSentry();
   ```

### 3. Server-side Setup

1. If you don't already have a server hooks file, create a new one in `src/hooks.server.(js|ts)`.

2. On the top of your `hooks.server.(js|ts)` file, initialize the Sentry SDK:

   ```javascript
   // hooks.server.(js|ts)
   import * as Sentry from '@sentry/sveltekit';

   Sentry.init({
     dsn: '__DSN__',
     tracesSampleRate: 1.0,
   });
   ```

3. Add our `handleErrorWithSentry` function to the `handleError` hook:

   ```javascript
   // hooks.server.(js|ts)
   import { handleErrorWithSentry } from '@sentry/sveltekit';

   const myErrorHandler = ({ error, event }) => {
     console.error('An error occurred on the server side:', error, event);
   };

   export const handleError = handleErrorWithSentry(myErrorHandler);
   // or alternatively, if you don't have a custom error handler:
   // export const handleError = handleErrorWithSentry();
   ```

4. Add our request handler to the `handle` hook in `hooks.server.ts`:

   ```javascript
   // hooks.server.(js|ts)
   import { sentryHandle } from '@sentry/sveltekit';

   export const handle = sentryHandle();
   // or alternatively, if you already have a handler defined, use the `sequence` function
   // see: https://kit.svelte.dev/docs/modules#sveltejs-kit-hooks-sequence
   // export const handle = sequence(sentryHandle(), yourHandler());
   ```

### 4. Vite Setup

Add `sentrySvelteKit` to your Vite plugins in `vite.config.(js|ts)` file so that the Sentry SDK can apply build-time
features. Make sure that it is added _before_ the `sveltekit` plugin:

```javascript
// vite.config.(js|ts)
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default {
  plugins: [sentrySvelteKit(), sveltekit()],
  // ... rest of your Vite config
};
```

This adds the
[Sentry Vite Plugin](https://github.com/getsentry/sentry-javascript-bundler-plugins/tree/main/packages/vite-plugin) to
your Vite config to automatically upload source maps to Sentry.

---

## Uploading Source Maps

After completing the [Vite Setup](#5-vite-setup), the SDK will automatically upload source maps to Sentry, when you
build your project. However, you still need to specify your Sentry auth token as well as your org and project slugs. You
can either set them as env variables (for example in a `.env` file):

- `SENTRY_ORG` your Sentry org slug
- `SENTRY_PROJECT` your Sentry project slug
- `SENTRY_AUTH_TOKEN` your Sentry auth token

Or you can pass them in whatever form you prefer to `sentrySvelteKit`:

```js
// vite.config.(js|ts)
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default {
  plugins: [
    sentrySvelteKit({
      sourceMapsUploadOptions: {
        org: 'my-org-slug',
        project: 'my-project-slug',
        authToken: process.env.SENTRY_AUTH_TOKEN,
      },
    }),
    sveltekit(),
  ],
  // ... rest of your Vite config
};
```

### Configuring Source maps upload

Under `sourceMapsUploadOptions`, you can also specify all additional options supported by the
[Sentry Vite Plugin](https://www.npmjs.com/package/@sentry/vite-plugin). This might be useful if you're using adapters
other than the Node adapter or have a more customized build setup.

```js
// vite.config.(js|ts)
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default {
  plugins: [
    sentrySvelteKit({
      sourceMapsUploadOptions: {
        org: 'my-org-slug',
        project: 'my-project-slug',
        authToken: 'process.env.SENTRY_AUTH_TOKEN',
        include: ['dist'],
        cleanArtifacts: true,
        setCommits: {
          auto: true,
        },
      },
    }),
    sveltekit(),
  ],
  // ... rest of your Vite config
};
```

### Disabeling automatic source map upload

If you don't want to upload source maps automatically, you can disable it as follows:

```js
// vite.config.(js|ts)
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default {
  plugins: [
    sentrySvelteKit({
      autoUploadSourceMaps: false,
    }),
    sveltekit(),
  ],
  // ... rest of your Vite config
};
```

## Configure Auto-Instrumentation

The SDK mostly relies on [SvelteKit's hooks](https://kit.svelte.dev/docs/hooks) to collect error and performance data.
However, SvelteKit doesn't yet offer a hook for universal or server-only `load` function calls. Therefore, the SDK uses
a Vite plugin to auto-instrument `load` functions so that you don't have to add a Sentry wrapper to each function
manually. Auto-instrumentation is enabled by default, as soon as you add the `sentrySvelteKit()` function call to your
`vite.config.(js|ts)`. However, you can customize the behavior, or disable it entirely. In this case, you can still
manually wrap specific `load` functions with the `withSentry` function.

Note: The SDK will only auto-instrument `load` functions in `+page` or `+layout` files that do not yet contain any
Sentry code. If you already have custom Sentry code in such files, you'll have to
[manually](#instrument-load-functions-manually) add our wrapper to your `load` functions.

### Customize Auto-instrumentation

By passing the `autoInstrument` option to `sentrySvelteKit` you can disable auto-instrumentation entirely, or customize
which `load` functions should be instrumented:

```javascript
// vite.config.(js|ts)
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default {
  plugins: [
    sentrySvelteKit({
      autoInstrument: {
        load: true, // universal load functions
        serverLoad: false, // server-only load functions
      },
    }),
    sveltekit(),
  ],
  // ... rest of your Vite config
};
```

### Disable Auto-instrumentation

If you set the `autoInstrument` option to `false`, the SDK won't auto-instrument any `load` function. You can still
[manually instrument](#instrument-load-functions-manually) specific `load` functions.

```javascript
// vite.config.(js|ts)
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default {
  plugins: [
    sentrySvelteKit({
      autoInstrument: false;
    }),
    sveltekit(),
  ],
  // ... rest of your Vite config
};
```

### Instrument `load` Functions Manually

If you don't want to use auto-instrumentation, you can also manually instrument specific `load` functions with our load
function wrappers:

To instrument your universal `load` functions in `+(page|layout).(js|ts)`, wrap our `wrapLoadWithSentry` function around
your load code:

```javascript
import { wrapLoadWithSentry } from '@sentry/sveltekit';

export const load = wrapLoadWithSentry(event => {
  //... your load code
});
```

To instrument server `load` functions in `+(page|layout).server.(js|ts)`, wrap our `wrapServerLoadWithSentry` function
around your load code:

```javascript
import { wrapServerLoadWithSentry } from '@sentry/sveltekit';

export const load = wrapServerLoadWithSentry(event => {
  //... your server load code
});
```
