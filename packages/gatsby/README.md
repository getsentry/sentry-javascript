<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for GatsbyJS

Register the package as a plugin in `gastby-config.js`:

```javascript
{
  // ...
  plugins: [
    {
      resolve: "@sentry/gatsby",
      options: {
          dsn: process.env.SENTRY_DSN, // this is the default
      }
    },
    // ...
  ]
}
```

Options will be passed directly to `Sentry.init`. See all available options in [our docs](https://docs.sentry.io/error-reporting/configuration/?platform=javascript). The `environment` value defaults to `NODE_ENV` (or `'development'` if `NODE_ENV` is not set).

## GitHub Actions

The `release` value is inferred from `GITHUB_SHA`.

## Netlify

The `release` value is inferred from `COMMIT_REF`.

## Vercel

To automatically capture the `release` value on Vercel you will need to register appropriate [system environment variable](https://vercel.com/docs/v2/build-step#system-environment-variables) (e.g. `VERCEL_GITHUB_COMMIT_SHA`) in your project.

## Sentry Performance

To enable tracing, supply either `tracesSampleRate` or `tracesSampler` to the options and make sure you have installed the `@sentry/tracing` package. This will also turn on the `BrowserTracing` integration for automatic instrumentation of pageloads and navigations.

```javascript
{
  // ...
  plugins: [
    {
      resolve: "@sentry/gatsby",
      options: {
        dsn: process.env.SENTRY_DSN, // this is the default

        // A rate of 1 means all traces will be sent, so it's good for testing.
        // In production, you'll likely want to either choose a lower rate or use `tracesSampler` instead (see below).
        tracesSampleRate: 1,

        // Alternatively:
        tracesSampler: samplingContext => {
          // Examine provided context data (along with anything in the global namespace) to decide the sample rate
          // for this transaction.
          // Can return 0 to drop the transaction entirely.

          if ("...") {
            return 0.5 // These are important - take a big sample
          }
          else if ("...") {
            return 0.01 // These are less important or happen much more frequently - only take 1% of them
          }
          else if ("...") {
            return 0 // These aren't something worth tracking - drop all transactions like this
          }
          else {
            return 0.1 // Default sample rate
          }
        }
      }
    },
    // ...
  ]
}
```

If you want to supply options to the `BrowserTracing` integration, use the `browserTracingOptions` parameter.

```javascript
{
  // ...
  plugins: [
    {
      resolve: "@sentry/gatsby",
      options: {
          dsn: process.env.SENTRY_DSN, // this is the default
          tracesSampleRate: 1, // or tracesSampler (see above)
          browserTracingOptions: {
            // disable creating spans for XHR requests
            traceXHR: false,
          }
      }
    },
    // ...
  ]
}
```

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)
