<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for NodeJS (Preview)

[![npm version](https://img.shields.io/npm/v/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dm](https://img.shields.io/npm/dm/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dt](https://img.shields.io/npm/dt/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)

**WARNING:** This SDK is part of an early access preview for the
[next generation](https://github.com/getsentry/raven-js/tree/next#readme) of
Sentry JavaScript SDKs. Public interfaces might change and break backwards
compatibility from time to time. We absolutely recommend
[raven](https://github.com/getsentry/raven-node) in production!

## Usage

To use this SDK, call `init(options)` as early as possible in the main entry
module. This will initialize the SDK and hook into the environment. Note that
you can turn off almost all side effects using the respective options.

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

To set context information or send manual events, use the exported functions of
`@sentry/node`. Note that these functions will not perform any action before you
have called `init()`:

```javascript
// Set user information, as well as tags and further extras
Sentry.setExtraContext({ battery: 0.7 });
Sentry.setTagsContext({ user_mode: 'admin' });
Sentry.setUserContext({ id: '4711' });

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

## Advanced Usage

If you don't want to use a global static instance of Sentry, you can create one
yourself:

```javascript
const { NodeFrontend } = require('@sentry/node');

const client = new NodeFrontend({
  dsn: '__DSN__',
  // ...
});

client.install();
// ...
```
