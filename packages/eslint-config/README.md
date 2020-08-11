<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK eslint config

[![npm version](https://img.shields.io/npm/v/@sentry/integrations.svg)](https://www.npmjs.com/package/@sentry/integrations)
[![npm dm](https://img.shields.io/npm/dm/@sentry/integrations.svg)](https://www.npmjs.com/package/@sentry/integrations)
[![npm dt](https://img.shields.io/npm/dt/@sentry/integrations.svg)](https://www.npmjs.com/package/@sentry/integrations)
[![typedoc](https://img.shields.io/badge/docs-typedoc-blue.svg)](http://getsentry.github.io/sentry-javascript/)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

Install with `yarn add -D @sentry/eslint-config`

## Configuration

Use `sentry-sdks` for base rules. Make sure to specify your tsconfig under `parserOptions.project` so that you can
correctly use the typescript rules. This configuration comes with

```json
{
  "extends": ["@sentry"],
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
