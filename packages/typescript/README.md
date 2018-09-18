<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Sentry TypeScript Configuration

[![npm version](https://img.shields.io/npm/v/@sentry/typescript.svg)](https://www.npmjs.com/package/@sentry/typescript)
[![npm dm](https://img.shields.io/npm/dm/@sentry/typescript.svg)](https://www.npmjs.com/package/@sentry/typescript)
[![npm dt](https://img.shields.io/npm/dt/@sentry/typescript.svg)](https://www.npmjs.com/package/@sentry/typescript)

[![typedoc](https://img.shields.io/badge/docs-typedoc-blue.svg)](http://getsentry.github.io/sentry-javascript/)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

Shared typescript configuration used at Sentry.

## Installation

```sh
# With Yarn:
yarn add --dev @sentry/typescript

# With NPM:
npm install --save-dev @sentry/typescript
```

## Usage

Add the following config files to your project's root directory:

**tslint.json**:

```json
{
  "extends": "@sentry/typescript/tslint"
}
```

**tsconfig.json**:

```json
{
  "extends": "./node_modules/@sentry/typescript/tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "rootDir": "src",
    "outDir": "dist"
  }
}
```
