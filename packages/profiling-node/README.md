<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry Profiling SDK for NodeJS

[![npm version](https://img.shields.io/npm/v/@sentry/profiling-node.svg)](https://www.npmjs.com/package/@sentry/profiling-node)
[![npm dm](https://img.shields.io/npm/dm/@sentry/profiling-node.svg)](https://www.npmjs.com/package/@sentry/profiling-node)
[![npm dt](https://img.shields.io/npm/dt/@sentry/profiling-node.svg)](https://www.npmjs.com/package/@sentry/profiling-node)

Profiling for Node.js applications.

## Documentation

- [Getting started](https://docs.sentry.io/platforms/javascript/guides/node/profiling/)
- [Configuration](https://docs.sentry.io/platforms/javascript/guides/node/profiling/#enabling-profiling)

## Building the package from source

Profiling uses native bindings to interact with V8. These are provided by `@sentry/node-cpu-profiler`, which attempts
to build from source during installation if a compatible prebuilt binary cannot be loaded.

Building requires Python and a C/C++ toolchain: `make` and a compiler on Linux, Xcode Command Line Tools on macOS,
or Visual Studio's C++ build tools on Windows. See the [node-gyp prerequisites](https://github.com/nodejs/node-gyp#installation)
for platform-specific requirements.

To build the native package yourself, clone the [Node CPU profiler repository](https://github.com/getsentry/sentry-javascript-profiling-node-binaries)
and run the following commands from its root:

```sh
yarn install --ignore-scripts
yarn build:lib
yarn build:bindings:configure
yarn build:bindings
```

The compiled native binary and JavaScript files are placed in that repository's `lib/` directory.
The native build scripts live in that repository, not in `packages/profiling-node`.

## Prebuilt binaries

Prebuilt binaries are distributed with `@sentry/node-cpu-profiler`. The
[native build workflow](https://github.com/getsentry/sentry-javascript-profiling-node-binaries/blob/main/.github/workflows/build.yml)
lists the platforms, architectures, and Node.js versions built by its CI.

## Support

- [Report a bug](https://github.com/getsentry/sentry-javascript/issues/new/choose)
- [Contributing](https://github.com/getsentry/sentry-javascript/blob/develop/CONTRIBUTING.md)
