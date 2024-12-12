<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Contributing

We welcome suggested improvements and bug fixes to the `@sentry/*` family of packages, in the form of pull requests on
[`GitHub`](https://github.com/getsentry/sentry-javascript). The guide below will help you get started, but if you have
further questions, please feel free to reach out on [Discord](https://discord.gg/Ww9hbqr). To learn about some general
SDK development principles check out the [SDK Development Guide](https://develop.sentry.dev/sdk/) in the Sentry
Developer Documentation.

## Setting up an Environment

We use [Volta](https://volta.sh/) to ensure we use consistent versions of node, yarn and pnpm.

Make sure to also enable [pnpm support in Volta](https://docs.volta.sh/advanced/pnpm) if you want to run the E2E tests
locally.

`sentry-javascript` is a monorepo containing several packages, and we use `lerna` to manage them. To get started,
install all dependencies, and then perform an initial build, so TypeScript can read all of the linked type definitions.

```
$ yarn
$ yarn build
```

With that, the repo is fully set up and you are ready to run all commands.

## Building Packages

Since we are using [`TypeScript`](https://www.typescriptlang.org/), you need to transpile the code to JavaScript to be
able to use it. From the top level of the repo, there are three commands available:

- `yarn build:dev`, which runs a one-time build of every package
- `yarn build:dev:filter <name of npm package>`, which runs `yarn build:dev` only in projects relevant to the given
  package (so, for example, running `yarn build:dev:filter @sentry/react` will build the `react` package, all of its
  dependencies (`utils`, `core`, `browser`, etc), and all packages which depend on it (currently `gatsby` and `nextjs`))
- `yarn build:dev:watch`, which runs `yarn build:dev` in watch mode (recommended)

Note: Due to package incompatibilities between Python versions, building native binaries currently requires a Python
version <3.12.

You can also run a production build via `yarn build`, which will build everything except for the tarballs for publishing
to NPM. You can use this if you want to bundle Sentry yourself. The build output can be found in the packages `build/`
folder, e.g. `packages/browser/build`. Bundled files can be found in `packages/browser/build/bundles`. Note that there
are no guarantees about the produced file names etc., so make sure to double check which files are generated after
upgrading.

## Testing SDK Packages Locally

To test local versions of SDK packages, for instance in test projects, you have a couple of options:

- Use [`yarn link`](https://classic.yarnpkg.com/lang/en/docs/cli/link/) to symlink your package to the test project.
- Use [`yalc` to install SDK packages](./docs/using-yalc.md) as if they were already published.
- Run `build:tarball` in the repo and `yarn add ./path/to/tarball.tgz` in the project.

## Adding Tests

**Any nontrivial fixes/features should include tests.** You'll find a `test` folder in each package.

For browser related changes, you may also add tests in `dev-packages/browser-integration-tests`. Similarly, for node
integration tests can be added in `dev-packages/node-integration-tests`. Finally, we also have E2E test apps in
`dev-packages/e2e-tests`.

## Running Tests

Running tests works the same way as building - running `yarn test` at the project root will run tests for all packages,
and running `yarn test` in a specific package will run tests for that package. There are also commands to run subsets of
the tests in each location. Check out the `scripts` entry of the corresponding `package.json` for details.

Note: you must run `yarn build` before `yarn test` will work.

## Debugging Tests

If you run into trouble writing tests and need to debug one of them, you can do so using VSCode's debugger.

0. If you don't already have it installed, install the Tasks Shell Input extension, which you'll find in the Extensions
   tab in the sidebar as one of the recommended workspace extensions.

1. Place breakpoints or `debugger` statements in the test or the underlying code wherever you'd like `jest` to pause.
2. Open the file containing the test in question, and make sure its tab is active (so you can see the file's contents).
3. Switch to the debugger in the sidebar and choose `Debug unit tests - just open file` from the dropdown.
4. Click the green "play" button to run the tests in the open file in watch mode.

Pro tip: If any of your breakpoints are in code run by multiple tests, and you run the whole test file, you'll land on
those breakpoints over and over again, in the middle of tests you don't care about. To avoid this, replace the test's
initial `it` or `test` with `it.only` or `test.only`. That way, when you hit a breakpoint, you'll know you got there are
part of the buggy test.

## Debug Build Flags

Throughout the codebase, you will find a `__DEBUG_BUILD__` constant. This flag serves two purposes:

1. It enables us to remove debug code from our minified CDN bundles during build, by replacing the flag with `false`
   before tree-shaking occurs.
2. It enables users to remove Sentry debug code from their production bundles during their own build. When we build our
   npm packages, we replace the flag with `(typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__)`. If the user
   does nothing, this evaluates to `true` and logging is included. But if the user runs their own replacement during
   build (again replacing the flag with `false`), the build will tree-shake the logging away, just as our bundle builds
   do.

Note that the replacement flag, `__SENTRY_DEBUG__`, is different from the original flag . This is necessary because the
replacement plugin runs twice, at two different stages of the build, and we don't want to run a replacement on our
replacement (as would happen if we reused `__DEBUG_BUILD__`).

## Linting

Similar to building and testing, linting can be done in the project root or in individual packages by calling
`yarn lint`.

Note: you must run `yarn build` before `yarn lint` will work.

## External Contributors

We highly appreciate external contributions to the SDK. If you want to contribute something, you can just open a PR
against `develop`.

The SDK team will check out your PR shortly!

When contributing to the codebase, please note:

- Make sure to follow the [Commit, Issue & PR guidelines](./docs/commit-issue-pr-guidelines.md)
- Non-trivial PRs will not be accepted without tests (see above).

## Commit, Issue & PR guidelines

See [Commit, Issue & PR guidelines](./docs/commit-issue-pr-guidelines.md).

## PR Reviews

See [PR Reviews](./docs/pr-reviews.md).

## Publishing a Release

_These steps are only relevant to Sentry employees when preparing and publishing a new SDK release._

[See the docs for publishing a release](./docs/publishing-a-release.md)
