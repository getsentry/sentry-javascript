<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Deno (Beta)

[![npm version](https://img.shields.io/npm/v/@sentry/deno.svg)](https://www.npmjs.com/package/@sentry/deno)
[![npm dm](https://img.shields.io/npm/dm/@sentry/deno.svg)](https://www.npmjs.com/package/@sentry/deno)
[![npm dt](https://img.shields.io/npm/dt/@sentry/deno.svg)](https://www.npmjs.com/package/@sentry/deno)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)

The Sentry Deno SDK is in beta. Please help us improve the SDK by
[reporting any issues or giving us feedback](https://github.com/getsentry/sentry-javascript/issues).

## Usage

To use this SDK, call `Sentry.init(options)` as early as possible in the main entry module. This will initialize the SDK
and hook into the environment. Note that you can turn off almost all side effects using the respective options.

```javascript
import * as Sentry from 'npm:@sentry/deno';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the exported functions of the Deno SDK. Note that these functions
will not perform any action before you have called `init()`:

```javascript
// Set user information, as well as tags and further extras
Sentry.setExtra('battery', 0.7);
Sentry.setTag('user_mode', 'admin');
Sentry.setUser({ id: '4711' });

// Add a breadcrumb for future events
Sentry.addBreadcrumb({
  message: 'My Breadcrumb',
  // ...
});

// Capture exceptions, messages or manual events
Sentry.captureMessage('Hello, world!');
Sentry.captureException(new Error('Good bye'));
Sentry.captureEvent({
  message: 'Manual',
  stacktrace: [
    // ...
  ],
});
```

## Auto-instrumentation (experimental)

Some libraries (e.g. `mysql`) don't emit tracing signals on their
own. To instrument them, Sentry uses
[orchestrion](https://github.com/getsentry/sentry-javascript) to
transform them at load time so they publish to
`node:diagnostics_channel`.

In Deno versions prior to 2.8.0, this is not available, as it
relies on `Module.registerHooks`, which was added in that
version.

As of Deno 2.8.3, you can use the `--import` or `--preload`
argument to `deno run` in order to enable these instrumentations.

```bash
$ deno run --import=@sentry/deno/import app.ts
```

> [!NOTE]
> In Deno versions **2.8.0** through **2.8.2**, a bug causes Deno
> to deadlock when a module hook is added in this way. As a
> workaround, you can import the loader explicitly, and then
> dynamically import your app to take advantage of the added
> module loading hooks.
>
> ```ts
> import 'npm:@sentry/deno/import';
> await import('./app.ts');
> ```

In both cases, your `app.ts` should simply load Sentry as usual:

```ts
// app.ts

// initialize Sentry as early as possible
import * as Sentry from 'npm:@sentry/deno';
Sentry.init({ dsn: '__DSN__' });

// ... the rest of the app...
```
