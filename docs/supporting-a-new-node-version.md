# Supporting a New Node.js Version

_These steps are only relevant to Sentry employees when adding support for a Node.js verison._

Adding support for a new Node version touches three repos.
Because native modules ship precompiled binaries that must be rebuilt for the new Node ABI, the native module repos must be released first, then we bump to the new versions of those in this repo and add the new Node version to the CI matrix.

The order is:

1. [sentry-javascript-profiling-node-binaries](https://github.com/getsentry/sentry-javascript-profiling-node-binaries)
2. [sentry-javascript-node-native-stacktrace](https://github.com/getsentry/sentry-javascript-node-native-stacktrace)
3. [sentry-javascript](https://github.com/getsentry/sentry-javascript)

The Node.js 26 rollout is a good reference:

- Profiling binaries [#32](https://github.com/getsentry/sentry-javascript-profiling-node-binaries/pull/32)
- Native stacktrace [#38](https://github.com/getsentry/sentry-javascript-node-native-stacktrace/pull/38)
- SDKs [#20710](https://github.com/getsentry/sentry-javascript/pull/20710)

## Background: ABI versions

Native addons are compiled against a specific Node.js [ABI version](https://nodejs.org/en/download/releases)
(also called `NODE_MODULE_VERSION`), not the Node major version. Each Node major maps to one ABI:

| Node major | ABI |
| ---------- | --- |
| 18         | 108 |
| 20         | 115 |
| 22         | 127 |
| 24         | 137 |
| 26         | 147 |

You can look up the ABI for a new release at https://nodejs.org/en/download/releases or by running `node -p process.versions.modules`
on the new version.

You'll need this number throughout, binaries are named after it
(e.g. `linux-x64-glibc-147`) for Node 26.

## Step 1: Native CPU profiler binaries

Repo: [sentry-javascript-profiling-node-binaries](https://github.com/getsentry/sentry-javascript-profiling-node-binaries)

Reference PR: [#32](https://github.com/getsentry/sentry-javascript-profiling-node-binaries/pull/32)

1. **Add the build matrix entries.** In `.github/workflows/build.yml`, add a new matrix entry for
   the new Node version + ABI for every target platform:
   - [ ] `linux-x64-glibc`
   - [ ] `linux-x64-musl`,
   - [ ] `linux-arm64-glibc`
   - [ ] `linux-arm64-musl`
   - [ ] `darwin-x64`,
   - [ ] `darwin-arm64`,
   - [ ] `win32-x64`

   The `binary` key follows the `<platform>-<abi>` naming convention (e.g. `linux-x64-glibc-147`).
   - Pick the right base container for musl targets — the Alpine tag must include the new Node
     version (e.g. `node:26-alpine3.22`).
   - **Toolchain caveat:** newer V8 headers may require a newer C++ compiler. Node 26's V8 v14
     headers pull in `<source_location>`, which the default compiler in the `ubuntu-20.04` glibc
     container is too old to build. A dedicated step upgrades just that target to `gcc-12`/`g++-12`
     (via `ppa:ubuntu-toolchain-r/test`). Watch for similar issues on future versions.

2. **Add the runtime ABI resolution.** In `src/index.ts`, add an `if (abi === '<new-abi>')` branch
   for each platform that `require`s the new `.node` binary
   (e.g. `sentry_cpu_profiler-linux-x64-glibc-147.node`).
3. Release a new version via Craft and note the version number for Step 3.

## Step 2: Native stack trace module

Repo: [sentry-javascript-node-native-stacktrace](https://github.com/getsentry/sentry-javascript-node-native-stacktrace)

Reference PR: [#38](https://github.com/getsentry/sentry-javascript-node-native-stacktrace/pull/38)

This mirrors Step 1 exactly — same matrix additions, same compiler caveat, same `src/index.ts` ABI
branches (here the binaries are named `stack-trace-<platform>-<abi>.node`).

1. Add the new Node version + ABI matrix entries in `.github/workflows/ci.yml` for all platforms.
2. Apply the same compiler upgrade step for the glibc x64 target if the build fails on newer V8
   headers.
3. Add the `if (abi === '<new-abi>')` resolution branches in `src/index.ts`.
4. Release a new version via Craft and note the version number for Step 3.

## Step 3: Bump versions in sentry-javascript

Repo: [sentry-javascript](https://github.com/getsentry/sentry-javascript)

Reference: [#20710](https://github.com/getsentry/sentry-javascript/pull/20710)

1. Add the version to the CI test matrix in `.github/workflows/build.yml` to every `node: [18, 20, 22, 24]` entry.

2. Bump the native module dependencies to the versions released in Steps 1 and 2:
   - [ ] `@sentry-internal/node-cpu-profiler` in `packages/profiling-node`
   - [ ] `@sentry-internal/node-native-stacktrace` in `packages/node-native/package.json`
   - [ ] Run `yarn install` to update `yarn.lock`

3. Register the new ABI in the profiling pruner. In
   `packages/profiling-node/scripts/prune-profiler-binaries.js`:
   - [ ] Add the Node major to ABI mapping to the `NODE_TO_ABI` object (e.g. `26: '147'`).
   - [ ] Add the corresponding `else if (NODE.startsWith('26'))` branch.

4. Allow the new major in the profiling integration, in `packages/profiling-node/src/integration.ts`:
   - [ ] Add the version number to the `if (![16, 18, 20, 22, 24, 26].includes(NODE_MAJOR))` guard
   - [ ] Add the version to the supported-versions list in the `console.warn` message below the guard (the string that reads `...prebuilt support for the following LTS versions of Node.js: 16, 18, 20, 22, 24.`)

5. Handle deprecation warnings. Each new Node version tends to deprecate APIs the SDK (or its dependencies) still use, which can break tests that assert on clean stderr or console output.

6. Fix version-specific test failures, some integrations or test dependencies may not yet work on the new version.
