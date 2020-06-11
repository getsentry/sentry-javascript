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

Options will be passed directly to `Sentry.init`. The `environment` value defaults to `NODE_ENV` (or `development` if not set).

## GitHub Actions

The `release` value is inferred from `GITHUB_SHA`.

## Netlify

The `release` value is inferred from `COMMIT_REF`.

## Vercel

To automatically capture the `release` value on Vercel you will need to register appropriate [system environment variable](https://vercel.com/docs/v2/build-step#system-environment-variables) (e.g. `VERCEL_GITHUB_COMMIT_SHA`) in your project.

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)
