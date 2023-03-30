<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for SvelteKit

[![npm version](https://img.shields.io/npm/v/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)
[![npm dm](https://img.shields.io/npm/dm/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)
[![npm dt](https://img.shields.io/npm/dt/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)

<!--
TODO: No docs yet, comment back in once we have docs
## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/sveltekit/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/) -->

## SDK Status

This SDK is currently in **Alpha state** and we're still experimenting with APIs and functionality.
We therefore make no guarantees in terms of semver or breaking changes.
If you want to try this SDK and come across a problem, please open a [GitHub Issue](https://github.com/getsentry/sentry-javascript/issues/new/choose).

## Compatibility

Currently, the minimum supported version of SvelteKit is `1.0.0`.

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/svelte` for the client side, with added functionality related to SvelteKit.

## Usage

Although the SDK is not yet stable, you're more than welcome to give it a try and provide us with early feedback.

**Here's how to get started:**

1. Ensure you've set up the [`@sveltejs/adapter-node` adapter](https://kit.svelte.dev/docs/adapter-node)

2. Install the Sentry SvelteKit SDK:

   ```bash
   # Using npm
   npm install @sentry/sveltekit

   # Using yarn
   yarn add @sentry/sveltekit
   ```

3. Create a `sentry.client.config.(js|ts)` file in the root directory of your SvelteKit project.
   In this file you can configure the client-side Sentry SDK just like every other browser-based SDK:

   ```javascript
    import * as Sentry from '@sentry/sveltekit';

    Sentry.init({
      dsn: '__DSN__',
      traceSampleRate: 1.0,
      // For instance, initialize Session Replay:
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      integrations: [new Sentry.Replay()]
    });
   ```


4. Create a `sentry.server.config.(js|ts)` file in the root directory of your SvelteKit project.
   In this file you can configure the server-side Sentry SDK, like the Sentry Node SDK:

   ```javascript
    import * as Sentry from '@sentry/sveltekit';

    Sentry.init({
      dsn: '__DSN__',
      traceSampleRate: 1.0,
    });
   ```

5. Add our `withSentryViteConfig` wrapper around your Vite config so that the Sentry SDK is added to your application in `vite.config.(js|ts)`:
   ```javascript
    import { sveltekit } from '@sveltejs/kit/vite';
    import { withSentryViteConfig } from '@sentry/sveltekit';

    export default withSentryViteConfig({
      plugins: [sveltekit()],
      // ...
    });
   ```

6. In your `hooks.client.(js|ts)` or `hooks.server.(js|ts)`, wrap the `handleError` functions as follows:

   ```javascript
    import { handleErrorWithSentry } from '@sentry/sveltekit';

    const myErrorHandler = ((input) => {
      console.error('An error occurred on the client-side');
      return error;
    });

    export const handleError = handleErrorWithSentry(myErrorHandler);
    // or alternatively, if you don't have a custom error handler:
    // export const handleError = handleErrorWithSentry();
   ```

7. To capture performance data on the server-side, add our handler to the `handle` hook in `hooks.server.ts`:

   ```javascript
    import { sentryHandle } from '@sentry/sveltekit';

    export const handle = sentryHandle;
    // or alternatively, if you already have a handler defined, use the `sequence` function
    // see: https://kit.svelte.dev/docs/modules#sveltejs-kit-hooks-sequence
    // export const handle = sequence(sentryHandle, yourHandler);
   ```

8. To catch errors and performance data in your universal `load` functions (e.g. in `+page.(js|ts)`), wrap our `wrapLoadWithSentry` function around your load code:

    ```javascript
    import { wrapLoadWithSentry } from '@sentry/sveltekit';

    export const load = wrapLoadWithSentry((event) => {
      //... your load code
    });
    ```

9. To catch errors and performance data in your server `load` functions (e.g. in `+page.server.(js|ts)`), wrap our `wrapServerLoadWithSentry` function around your load code:

    ```javascript
    import { wrapServerLoadWithSentry } from '@sentry/sveltekit';

    export const load = wrapServerLoadWithSentry((event) => {
      //... your server load code
    });
    ```

## Known Limitations

This SDK is still under active development and several features are missing.
Take a look at our [SvelteKit SDK Development Roadmap](https://github.com/getsentry/sentry-javascript/issues/6692) to follow the progress:

- **Source Maps** upload is not yet working correctly.
  We already investigated [some options](https://github.com/getsentry/sentry-javascript/discussions/5838#discussioncomment-4696985) but uploading source maps doesn't work automtatically out of the box yet.
  This will be addressed next, as we release the next alpha builds.

- **Adapters** other than `@sveltejs/adapter-node` are currently not supported.
  We haven't yet tested other platforms like Vercel.
  This is on our roadmap but it will come at a later time.

- We're aiming to **simplify SDK setup** in the future so that you don't have to go in and manually add our wrappers to all your `load` functions.
  This will be addressed once the SDK supports all Sentry features.
