<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Contributing

This part of the documentation gives you a basic overview of how to help with the development of our `@sentry/*`
packages contained in this repo.

## Community

The public-facing channels for support and development of Sentry SDKs can be found on [Discord](https://discord.gg/Ww9hbqr).

## Setting up an Environment

To run the test suite and run our code linter, node.js and yarn are required.

[`node`](https://nodejs.org/download) [`yarn`](https://yarnpkg.com/en/docs/install)

Since this is a mono repo containing several packages, we use `lerna` to manage them.

To get started call:

```
$ yarn
```

After that you need to setup the workspace with:

```
$ yarn lerna bootstrap
```

With that, the repo is fully setup and you are ready to run all commands.

## Build

Since we are using [`TypeScript`](https://www.typescriptlang.org/) you need to transpile the code to JavaScript to be
able to use it. Every package has a `build` script which takes care of everything. You can also run `build` on every
package by calling

```
$ yarn build
```

in the project root.

## Running the Test Suite

You can run all test at once by calling `yarn test` in the project root or in individual sub packages. Note that you must run `yarn build` before the test command will work.

## Lint

You can run all test at once by calling `yarn lint` in the project root or in individual sub packages. Note that you must run `yarn build` before the lint command will work.

## Contributing Back Code

Please, send over suggestions and bug fixes in the form of pull requests on
[`GitHub`](https://github.com/getsentry/sentry-javascript). Any nontrivial fixes/features should include tests. Do not
bump version numbers yourself. For new features and improvements consider contributing to our new SDKs instead,
`raven-js` and `raven-node` will still be supported but are in maintenance mode and will only receive bug fixes.
