<p align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
    <br />
</p>

# Sentry TypeScript Configuration

[![npm version](https://img.shields.io/npm/v/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dm](https://img.shields.io/npm/dm/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)
[![npm dt](https://img.shields.io/npm/dt/@sentry/node.svg)](https://www.npmjs.com/package/@sentry/node)

Shared typescript configuration used at Sentry.

## Installation

```sh
# With Yarn:
yarn add --dev @sentry/typescript

# With NPM:
npm install --save-dev @sentry/typescript
```

## Usage

Add the folling config files to your project's root directory:

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
