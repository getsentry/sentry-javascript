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

To run the test suite and our code linter, node.js and yarn are required.

[`node` download](https://nodejs.org/download) [`yarn` download](https://yarnpkg.com/en/docs/install)

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

Note that _for the `browser` package only_, if you add a new file to the
[integration test suite](https://github.com/getsentry/sentry-javascript/tree/master/packages/browser/test/integration/suites),
you also need to add it to
[the list in `shell.js`](https://github.com/getsentry/sentry-javascript/blob/b74e199254147fd984e7bb1ea24193aee70afa74/packages/browser/test/integration/suites/shell.js#L25)
as well. Adding tests to existing files will work out of the box in all packages.

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

## Considerations Before Sending Your First PR

When contributing to the codebase, please note:

- Make sure to follow the [Commit, Issue & PR guidelines](#commit-issue--pr-guidelines)
- Non-trivial PRs will not be accepted without tests (see above).
- Please do not bump version numbers yourself.
- [`raven-js`](https://github.com/getsentry/sentry-javascript/tree/3.x/packages/raven-js) and
  [`raven-node`](https://github.com/getsentry/sentry-javascript/tree/3.x/packages/raven-node) are deprecated, and only
  bug and security fix PRs will be accepted targeting the
  [3.x branch](https://github.com/getsentry/sentry-javascript/tree/3.x). Any new features and improvements should be to
  our new SDKs (`browser`, `node`, and framework-specific packages like `react` and `nextjs`) and the packages which
  support them (`core`, `utils`, `integrations`, and the like).

## PR reviews

For feedback in PRs, we use the [LOGAF scale](https://blog.danlew.net/2020/04/15/the-logaf-scale/) to specify how
important a comment is:

- `l`: low - nitpick. You may address this comment, but you don't have to.
- `m`: medium - normal comment. Worth addressing and fixing.
- `h`: high - Very important. We must not merge this PR without addressing this issue.

You only need one approval from a maintainer to be able to merge. For some PRs, asking specific or multiple people for
review might be adequate.

Our different types of reviews:

1. **LGTM without any comments.** You can merge immediately.
2. **LGTM with low and medium comments.** The reviewer trusts you to resolve these comments yourself, and you don't need
   to wait for another approval.
3. **Only comments.** You must address all the comments and need another review until you merge.
4. **Request changes.** Only use if something critical is in the PR that absolutely must be addressed. We usually use
   `h` comments for that. When someone requests changes, the same person must approve the changes to allow merging. Use
   this sparingly.

## Commit, Issue & PR guidelines

### Commits

For commit messages, we use the format:

```
<type>(<scope>): <subject> (<github-id>)
```

For example: `feat(core): Set custom transaction source for event processors (#5722)`.

See [commit message format](https://develop.sentry.dev/commit-messages/#commit-message-format) for details.

The Github-ID can be left out until the PR is merged.

### Issues

Issues should at least be categorized by package, for example `package: Node`. Additional labels for categorization can
be added, and the Sentry SDK team may also add further labels as needed.

### Pull Requests (PRs)

PRs are merged via `Squash and merge`. This means that all commits on the branch will be squashed into a single commit,
and committed as such onto master.

- The PR name can generally follow the commit name (e.g.
  `feat(core): Set custom transaction source for event processors`)
- Make sure to rebase the branch on `master` before squashing it
- Make sure to update the commit message of the squashed branch to follow the commit guidelines - including the PR
  number

### Gitflow

We use [Gitflow](https://docs.github.com/en/get-started/quickstart/github-flow) as a branching model.

For more details, [see our Gitflow docs](./docs/gitflow.md).

## Publishing a Release

_These steps are only relevant to Sentry employees when preparing and publishing a new SDK release._

[See the docs for publishing a release](./docs/publishing-a-release.md)
