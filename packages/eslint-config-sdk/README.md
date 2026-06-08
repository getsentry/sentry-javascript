<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK eslint config

[![npm version](https://img.shields.io/npm/v/@sentry/eslint-config-sdk.svg)](https://www.npmjs.com/package/@sentry/eslint-config-sdk)
[![npm dm](https://img.shields.io/npm/dm/@sentry/eslint-config-sdk.svg)](https://www.npmjs.com/package/@sentry/eslint-config-sdk)
[![npm dt](https://img.shields.io/npm/dt/@sentry/eslint-config-sdk.svg)](https://www.npmjs.com/package/@sentry/eslint-config-sdk)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)

## General

Install with `yarn add -D @sentry/eslint-config-sdk`

## Package Status

This package is an internal library published for use by Sentry-owned JavaScript SDK packages and repositories. It is not
part of the public API contract and may change in any release. Do not rely on SemVer compatibility if you depend on it
directly.

## Configuration

Use `@sentry-internal` for base rules. Make sure to specify your tsconfig under `parserOptions.project` so that you can
correctly use the typescript rules. This configuration comes with

```json
{
  "extends": ["@sentry/sdk"],
  "overrides": [
    {
      "files": ["*.ts", "*.tsx", "*.d.ts"],
      "parserOptions": {
        "project": "./tsconfig.json"
      }
    }
  ]
}
```
