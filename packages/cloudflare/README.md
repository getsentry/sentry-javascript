<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Cloudflare [UNRELEASED]

[![npm version](https://img.shields.io/npm/v/@sentry/cloudflare.svg)](https://www.npmjs.com/package/@sentry/cloudflare)
[![npm dm](https://img.shields.io/npm/dm/@sentry/cloudflare.svg)](https://www.npmjs.com/package/@sentry/cloudflare)
[![npm dt](https://img.shields.io/npm/dt/@sentry/cloudflare.svg)](https://www.npmjs.com/package/@sentry/cloudflare)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

**Note: This SDK is unreleased. Please follow the
[tracking GH issue](https://github.com/getsentry/sentry-javascript/issues/12620) for updates.**

Below details the setup for the Cloudflare Workers. Cloudflare Pages support is in active development.

## Setup (Cloudflare Workers)

To get started, first install the `@sentry/cloudflare` package:

```bash
npm install @sentry/cloudflare
```

Then set either the `nodejs_compat` or `nodejs_als` compatibility flags in your `wrangler.toml`. This is because the SDK
needs access to the `AsyncLocalStorage` API to work correctly.

```toml
compatibility_flags = ["nodejs_compat"]
# compatibility_flags = ["nodejs_als"]
```

To use this SDK, wrap your handler with the `withSentry` function. This will initialize the SDK and hook into the
environment. Note that you can turn off almost all side effects using the respective options.

Currently only ESM handlers are supported.

```javascript
import * as Sentry from '@sentry/cloudflare';

export default withSentry(
	(env) => ({
		dsn: env.SENTRY_DSN,
    // Set tracesSampleRate to 1.0 to capture 100% of spans for tracing.
		tracesSampleRate: 1.0,
	}),
	{
		async fetch(request, env, ctx) {
			return new Response('Hello World!');
		},
	} satisfies ExportedHandler<Env>
);
```

### Sourcemaps (Cloudflare Workers)

Configure uploading sourcemaps via the Sentry Wizard:

```bash
npx @sentry/wizard@latest -i sourcemaps
```

See more details in our [docs](https://docs.sentry.io/platforms/javascript/sourcemaps/).

## Usage (Cloudflare Workers)

To set context information or send manual events, use the exported functions of `@sentry/cloudflare`. Note that these
functions will require your exported handler to be wrapped in `withSentry`.

```javascript
import * as Sentry from '@sentry/cloudflare';

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
