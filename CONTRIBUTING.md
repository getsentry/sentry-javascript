<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <picture>
      <source srcset="https://sentry-brand.storage.googleapis.com/sentry-logo-white.png" media="(prefers-color-scheme: dark)" />
      <source srcset="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)" />
      <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280">
    </picture>
  </a>
</p>

# Contributing

We welcome suggested improvements and bug fixes to the `@sentry/*` family of packages. If you're not on the Sentry
team, read [External contributors](#external-contributors) before you open a pull request. The guide below will help
you get started, but if you have further questions, please feel free to reach out on
[Discord](https://discord.gg/Ww9hbqr). To learn about some general SDK development principles check out the
[SDK Development Guide](https://develop.sentry.dev/sdk/) in the Sentry Developer Documentation.

## Setting up an Environment

`sentry-javascript` is a monorepo containing several packages, managed with pnpm workspaces and Nx. pnpm installs the
Node.js and pnpm versions the repo pins.

1. Install pnpm 12 or newer, see the [pnpm installation docs](https://pnpm.io/installation).
2. Install a default Node.js version through pnpm:

   ```sh
   pnpm runtime set node 24 -g
   ```

   If this fails with `ERR_PNPM_GLOBAL_BIN_DIR_NOT_IN_PATH` (for example because pnpm came from npm or Homebrew instead
   of the install script), run [`pnpm setup`](https://pnpm.io/cli/setup) to add pnpm's global bin directory to your
   `PATH`, restart your shell, and try again.

3. Install all dependencies, and then perform an initial build, so TypeScript can read all of the linked type
   definitions:

   ```sh
   pnpm install
   pnpm run build
   ```

With that, the repo is fully set up and you are ready to run all commands. If you used Volta before, or `node --version`
doesn't match the repo, see [Node.js and pnpm Versions](#nodejs-and-pnpm-versions).

## Building Packages

Since we are using [`TypeScript`](https://www.typescriptlang.org/), you need to transpile the code to JavaScript to be
able to use it. From the top level of the repo, there are three commands available:

- `pnpm run build:dev`, which runs a one-time build of every package
- `pnpm run build:dev:filter <name of npm package>`, which runs `pnpm run build:dev` only in projects relevant to the given
  package (so, for example, running `pnpm run build:dev:filter @sentry/react` will build the `react` package, all of its
  dependencies (`utils`, `core`, `browser`, etc), and all packages which depend on it (currently `gatsby` and `nextjs`))
- `pnpm run build:dev:watch`, which runs `pnpm run build:dev` in watch mode (recommended)

Note: Due to package incompatibilities between Python versions, building native binaries currently requires a Python
version <3.12.

You can also run a production build via `pnpm run build`, which will build everything except for the tarballs for publishing
to NPM. You can use this if you want to bundle Sentry yourself. The build output can be found in the packages `build/`
folder, e.g. `packages/browser/build`. Bundled files can be found in `packages/browser/build/bundles`. Note that there
are no guarantees about the produced file names etc., so make sure to double check which files are generated after
upgrading.

## Testing SDK Packages Locally

To test local versions of SDK packages, for instance in test projects, you have a couple of options:

- Use [`pnpm link`](./docs/using-pnpm-link.md) to symlink your package to the test project.
- Use [`yalc` to install SDK packages](./docs/using-yalc.md) as if they were already published.
- Run `build:tarball` in the repo and `pnpm add ./path/to/tarball.tgz` in the project.

## Adding Tests

**Any nontrivial fixes/features should include tests.** You'll find a `test` folder in each package.

For browser related changes, you may also add tests in `dev-packages/browser-integration-tests`. Similarly, for node
integration tests can be added in `dev-packages/node-integration-tests`. Finally, we also have E2E test apps in
`dev-packages/e2e-tests`.

## Running Tests

Running tests works the same way as building - running `pnpm run test` at the project root will run tests for all packages,
and running `pnpm run test` in a specific package will run tests for that package. There are also commands to run subsets of
the tests in each location. Check out the `scripts` entry of the corresponding `package.json` for details.

Note: you must run `pnpm run build` before `pnpm run test` will work.

## Running E2E Tests Locally

E2E tests verify SDK behavior in real-world framework scenarios.

### Prerequisites

1. **Docker**: Required for some E2E tests
2. **pnpm-managed Node.js** (see [Setting up an Environment](#setting-up-an-environment)): The E2E tests run each app on
   the Node.js version that it pins. Without pnpm's `node` shim, they use your current Node.js version.

### Step-by-Step Instructions

1. **Build the SDK packages and create tarballs:**

   ```bash
   pnpm run build
   pnpm run build:tarball
   ```

   Note: You must re-run `pnpm run build:tarball` after any changes to packages.

2. **Set up environment (optional):**

   ```bash
   cd dev-packages/e2e-tests
   cp .env.example .env
   # Fill in Sentry project auth info if running tests that send data to Sentry
   ```

3. **Run all E2E tests:**

   ```bash
   pnpm run test:e2e
   ```

4. **Or run a specific test application:**

   ```bash
   pnpm run test:run <app-name>
   # Example: pnpm run test:run nextjs-app-dir
   ```

5. **Run with a specific variant:**
   ```bash
   pnpm run test:run <app-name> --variant <variant-name>
   # Example: pnpm run test:run nextjs-pages-dir --variant 15
   ```

### Common Issues and Troubleshooting

#### Tests fail after making SDK changes

Make sure to rebuild tarballs:

```bash
pnpm run build
pnpm run build:tarball
```

#### Docker-related issues

- Ensure Docker daemon is running, some E2E tests require Docker

#### Debugging test failures

1. Check browser console logs for SDK initialization errors
2. Enable debug mode in the test app's Sentry config: `debug: true`

For more details, see [dev-packages/e2e-tests/README.md](dev-packages/e2e-tests/README.md).

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
`pnpm run lint`.

Note: you must run `pnpm run build` before `pnpm run lint` will work.

## External contributors

Before you write code, get a maintainer's go-ahead in an issue. That way, nobody spends a weekend on a PR that just
sits in our queue. We check that the change fits our plans and that we have time to review it. Code details can wait
for the PR review.

1. Find or open an issue for your change. Describe the problem and what you want to change.
2. Wait for a maintainer to give you the go-ahead.
3. If someone else is assigned to the issue, ask them in the issue before you start.
4. Open a PR against `develop` and link the issue, for example `Fixes #1234`.

This also applies to small changes. We may close PRs without a go-ahead.

### Using AI tools

Use any tools you like. You're still the one who answers the review comments, so read, test, and understand every
change before you submit it. We close PRs that look like unreviewed agent output.

### Before you open a PR

- Follow the [Commit, Issue & PR guidelines](./docs/commit-issue-pr-guidelines.md).
- Add tests for non-trivial changes (see [Adding Tests](#adding-tests)).
- Keep each PR to one change. Put unrelated refactors in a separate PR.
- Run `pnpm run lint` and the tests for the packages you changed.

### After you open a PR

Ideally, answer review comments within a few hours, and within a day at the latest. While the change is still fresh in
the reviewer's head, each round is quick, and a PR that keeps moving is more likely to get merged. We may close PRs
that go quiet for a long time.

We try to review PRs quickly, but now and then one slips through the cracks. That's on us, not you. If you haven't heard
back in a few days, `@` mention a maintainer to ping us.

## Commit, Issue & PR guidelines

See [Commit, Issue & PR guidelines](./docs/commit-issue-pr-guidelines.md).

## PR Reviews

See [PR Reviews](./docs/pr-reviews.md).

## Publishing a Release

_These steps are only relevant to Sentry employees when preparing and publishing a new SDK release._

[See the docs for publishing a release](./docs/publishing-a-release.md)

## Node.js and pnpm Versions

- The root `package.json` pins Node.js in `devEngines.runtime` and pnpm in `packageManager`. CI reads the same fields.
- pnpm's `node` command runs the Node.js version of the nearest `package.json` that pins one
  ([project-aware global bins](https://pnpm.io/global-packages#project-aware-global-bins)). Packages and E2E test apps
  inherit the root version, and can override it with their own `devEngines.runtime`.

If `node --version` or `pnpm --version` doesn't match the repo, run `which node pnpm`. Both should be in
`$PNPM_HOME/bin`. If not, another tool (Volta, nvm, fnm, corepack, Homebrew Node.js) comes first in your `PATH`. Remove it,
or move `$PNPM_HOME/bin` before it.

### Migrating from Volta

The repo no longer has a `volta` field, so Volta runs its default Node.js instead of the version the repo pins.
[Uninstall Volta](https://docs.volta.sh/advanced/uninstall) and follow the
[setup](#setting-up-an-environment). If other projects still need Volta, keep it, but put `$PNPM_HOME/bin` before
`~/.volta/bin` in your `PATH`, and use `volta run node` in those projects.
