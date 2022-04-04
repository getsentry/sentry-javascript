<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Contributing

We welcome suggested improvements and bug fixes to the `@sentry/*` family of packages, in the form of pull requests on [`GitHub`](https://github.com/getsentry/sentry-javascript). The guide below will help you get started, but if you have further questions, please feel free to reach out on [Discord](https://discord.gg/Ww9hbqr).


## Setting up an Environment

To run the test suite and our code linter, node.js and yarn are required.

[`node` download](https://nodejs.org/download)
[`yarn` download](https://yarnpkg.com/en/docs/install)

`sentry-javascript` is a monorepo containing several packages, and we use `lerna` to manage them. To get started, install all dependencies, use `lerna` to bootstrap the workspace, and then perform an initial build, so TypeScript can read all of the linked type definitions.

```
$ yarn
$ yarn lerna bootstrap
$ yarn build
```

With that, the repo is fully set up and you are ready to run all commands.

## Building Packages

Since we are using [`TypeScript`](https://www.typescriptlang.org/), you need to transpile the code to JavaScript to be able to use it. From the top level of the repo, there are three commands available:

- `yarn build:dev`, which runs a one-time build of ES5 and ES6 versions of every package
- `yarn build:dev:filter <name of npm package>`, which runs `yarn build:dev` only in projects relevant to the given package (so, for example, running `yarn build:dev:filter @sentry/react` will build the `react` package, all of its dependencies (`utils`, `core`, `browser`, etc), and all packages which depend on it (currently `gatsby` and `nextjs`))
- `yarn build:dev:watch`, which runs `yarn build:dev` in watch mode (recommended)

## Adding Tests

**Any nontrivial fixes/features should include tests.** You'll find a `test` folder in each package.

Note that _for the `browser` package only_, if you add a new file to the [integration test suite](https://github.com/getsentry/sentry-javascript/tree/master/packages/browser/test/integration/suites), you also need to add it to [the list in `shell.js`](https://github.com/getsentry/sentry-javascript/blob/b74e199254147fd984e7bb1ea24193aee70afa74/packages/browser/test/integration/suites/shell.js#L25) as well. Adding tests to existing files will work out of the box in all packages.

## Running Tests

Running tests works the same way as building - running `yarn test` at the project root will run tests for all packages, and running `yarn test` in a specific package will run tests for that package. There are also commands to run subsets of the tests in each location. Check out the `scripts` entry of the corresponding `package.json` for details.

Note: you must run `yarn build` before `yarn test` will work.

## Debugging Tests

If you run into trouble writing tests and need to debug one of them, you can do so using VSCode's debugger.

0. If you don't already have it installed, install the Tasks Shell Input extension, which you'll find in the Extensions tab in the sidebar as one of the recommended workspace extensions.

1. Place breakpoints or `debugger` statements in the test or the underlying code wherever you'd like `jest` to pause.
2. Open the file containing the test in question, and make sure its tab is active (so you can see the file's contents).
3. Switch to the debugger in the sidebar and choose `Debug unit tests - just open file` from the dropdown.
4. Click the green "play" button to run the tests in the open file in watch mode.

Pro tip: If any of your breakpoints are in code run by multiple tests, and you run the whole test file, you'll land on those breakpoints over and over again, in the middle of tests you don't care about. To avoid this, replace the test's initial `it` or `test` with `it.only` or `test.only`. That way, when you hit a breakpoint, you'll know you got there are part of the buggy test.

## Debug Build Flags

Throughout the codebase, you will find debug flags like `IS_DEBUG_BUILD` guarding various code sections.
These flags serve two purposes:

1. They enable us to remove debug code for our production browser bundles.
2. Enable users to tree-shake Sentry debug code for their production builds.

These debug flags need to be declared in each package individually and must not be imported across package boundaries, because some build tools have trouble tree-shaking imported guards.
As a convention, we define debug flags in a `flags.ts` file in the root of a package's `src` folder.
The `flags.ts` file will contain "magic strings" like `__SENTRY_DEBUG__` that may get replaced with actual values during our, or the user's build process.
Take care when introducing new flags - they must not throw if they are not replaced.

## Linting

Similar to building and testing, linting can be done in the project root or in individual packages by calling `yarn lint`.

Note: you must run `yarn build` before `yarn lint` will work.

## Considerations Before Sending Your First PR

When contributing to the codebase, please note:

- Non-trivial PRs will not be accepted without tests (see above).
- Please do not bump version numbers yourself.
- [`raven-js`](https://github.com/getsentry/sentry-javascript/tree/3.x/packages/raven-js) and [`raven-node`](https://github.com/getsentry/sentry-javascript/tree/3.x/packages/raven-node) are deprecated, and only bug and security fix PRs will be accepted targeting the [3.x branch](https://github.com/getsentry/sentry-javascript/tree/3.x). Any new features and improvements should be to our new SDKs (`browser`, `node`, and framework-specific packages like `react` and `nextjs`) and the packages which support them (`core`, `hub`, `integrations`, and the like).

## Publishing a Release

_These steps are only relevant to Sentry employees when preparing and publishing a new SDK release._

1. Determine what version will be released (we use [semver](https://semver.org)).
2. Update [`CHANGELOG.md`](https://github.com/getsentry/sentry-javascript/edit/master/CHANGELOG.md) to add an entry for the next release number and a list of changes since the last release. (See details below.)
3. Run the [Prepare Release](https://github.com/getsentry/sentry-javascript/actions/workflows/release.yml) workflow.
4. A new issue should appear in https://github.com/getsentry/publish/issues.
5. Ask a member of the [@getsentry/releases team](https://github.com/orgs/getsentry/teams/releases/members) to approve the release.

### Updating the Changelog

1. Create a new branch.
2. Run `git log --format="- %s"` and copy everything since the last release.
3. Create a new section in the changelog, deciding based on the changes whether it should be a minor bump or a patch release.
4. Paste in the logs you copied earlier.
5. Delete any which aren't user-facing changes.
6. Alphabetize the rest.
7. Run a regex find and replace, searching for `\(#(\d+)\)` and replacing it with `([#$1](https://github.com/getsentry/sentry-javascript/pull/$1))`. (This will linkify all of the PR references.)
8. If any of the PRs are from external contributors, include underneath the commits `Work in this release contributed by <list of external contributors' GitHub usernames>. Thank you for your contributions!`. If there's only one external PR, don't forget to remove the final `s`. If there are three or more, use an Oxford comma. (It's in the Sentry styleguide!)
9. Commit, push, and open a PR with the title `meta: Update changelog for <fill in relevant version here>`.
