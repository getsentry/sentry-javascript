<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK eslint config

[![npm version](https://img.shields.io/npm/v/@sentry-internal/eslint-config-sdk.svg)](https://www.npmjs.com/package/@sentry-internal/eslint-config-sdk)
[![npm dm](https://img.shields.io/npm/dm/@sentry-internal/eslint-config-sdk.svg)](https://www.npmjs.com/package/@sentry-internal/eslint-config-sdk)
[![npm dt](https://img.shields.io/npm/dt/@sentry-internal/eslint-config-sdk.svg)](https://www.npmjs.com/package/@sentry-internal/eslint-config-sdk)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)

## General

Install with `yarn add -D @sentry-internal/eslint-config-sdk`

## Configuration

Use `@sentry-internal` for base rules. Make sure to specify your tsconfig under `parserOptions.project` so that you can
correctly use the typescript rules. This configuration comes with

```json
{
  "extends": ["@sentry-internal/sdk"],
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
