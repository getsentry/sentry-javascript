<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry TypeScript Configuration

[![npm version](https://img.shields.io/npm/v/@sentry-internal/typescript.svg)](https://www.npmjs.com/package/@sentry-internal/typescript)
[![npm dm](https://img.shields.io/npm/dm/@sentry-internal/typescript.svg)](https://www.npmjs.com/package/@sentry-internal/typescript)
[![npm dt](https://img.shields.io/npm/dt/@sentry-internal/typescript.svg)](https://www.npmjs.com/package/@sentry-internal/typescript)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

Shared typescript configuration used at Sentry.

## Installation

```sh
# With Yarn:
yarn add --dev @sentry-internal/typescript

# With NPM:
npm install --save-dev @sentry-internal/typescript
```

## Usage

Add the following config files to your project's root directory:

**tsconfig.json**:

```json
{
  "extends": "./node_modules/@sentry-internal/typescript/tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "rootDir": "src",
    "outDir": "dist"
  }
}
```

For an example of how to use this package in a monorepo, check out this package's own parent repo,
https://github.com/getsentry/sentry-javascript.
