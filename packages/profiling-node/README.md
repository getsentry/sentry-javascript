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

### Building the package from source

Profiling uses native modules to interop with the v8 javascript engine which means that you may be required to build it
from source. The libraries required to successfully build the package from source are often the same libraries that are
already required to build any other package which uses native modules and if your codebase uses any of those modules,
there is a fairly good chance this will work out of the box. The required packages are python, make and g++.

**Windows:** If you are building on windows, you may need to install Visual Studio's C++ build tools.

**macOS:** Install Xcode Command Line Tools for the compiler and make.

See the [node-gyp prerequisites](https://github.com/nodejs/node-gyp#installation) for supported Python versions and
platform-specific requirements.

After you have installed the toolchain, you should be able to build the binaries from source.
The native bindings are maintained in the [Node CPU profiler repository](https://github.com/getsentry/sentry-javascript-profiling-node-binaries).
Clone that repository, install its dependencies with `yarn install --ignore-scripts`, and run the following from its root:

```bash
# configure node-gyp using yarn
yarn build:bindings:configure
# or using npm
npm run build:bindings:configure

# compile the binaries using yarn
yarn build:bindings
# or using npm
npm run build:bindings
```

After the binaries are built, you should see them inside that repository's lib folder.

### Prebuilt binaries

We currently ship prebuilt binaries for a few of the most common platforms and node versions.

- macOS x64
- Linux ARM64 (musl)
- Linux x64 (glibc)
- Windows x64

For a more detailed list, see the `job_compile` job in the [native build workflow](https://github.com/getsentry/sentry-javascript-profiling-node-binaries/blob/main/.github/workflows/build.yml).

## Support

- [Report a bug](https://github.com/getsentry/sentry-javascript/issues/new/choose)
- [Contributing](https://github.com/getsentry/sentry-javascript/blob/develop/CONTRIBUTING.md)
