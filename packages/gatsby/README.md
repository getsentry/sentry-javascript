<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for GatsbyJS

Register the package as a plugin in `gatsby-config.js`:

```javascript
module.exports = {
  // ...
  plugins: [
    {
      resolve: "@sentry/gatsby",
    },
    // ...
  ]
}
```

Then, create a `sentry.config.js` (can also be TS) file and add `Sentry.init` call:

```javascript
import * as Sentry from "@sentry/gatsby";

Sentry.init({
  dsn: "__PUBLIC_DSN__",

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,

  // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],

  // Capture Replay for 10% of all sessions,
  // plus for 100% of sessions with an error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

## Links

Check out our docs for configuring your SDK setup:

* [Getting Started](https://docs.sentry.io/platforms/javascript/guides/gatsby/)
* [Source Maps Upload](https://docs.sentry.io/platforms/javascript/guides/gatsby/sourcemaps/)
