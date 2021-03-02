<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for NextJS

TODO: npm version, npm dm, npm dt, typedoc

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## Usage

TODO

## Sourcemaps

It's assumed that `@sentry/nextjs` is running in the project.
Configuring sourcemaps with the NextJS SDK only takes a few steps.

1. If you're using TypeScript, make sure sourcemaps are generated.
2. Create the `.sentryclirc` file in the root of your project directory.
3. [Install](https://docs.sentry.io/product/cli/installation/)
and [configure](https://docs.sentry.io/product/cli/configuration/)
[`sentry-cli`](https://github.com/getsentry/sentry-cli).
4. Add the Sentry organization name and project name as environment variables.
5. Install and configure the  [`sentry-webpack-plugin`](https://docs.sentry.io/platforms/javascript/sourcemaps/tools/webpack/),
by creating the following `next.config.js` in the root of your project directory:

```js
const SentryWebpackPlugin = require("@sentry/webpack-plugin");

module.exports = {
  productionBrowserSourceMaps: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.plugins.push(
      new SentryWebpackPlugin({
        // sentry-cli configuration
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJ,

        // webpack specific configuration
        urlPrefix: "~/_next/",
        include: ".next/",
        ignore: ["node_modules", "webpack.config.js"],

        dryRun: true, // useful for dev environments; set to false in production
      })
    );

    return config;
  },
};
```
