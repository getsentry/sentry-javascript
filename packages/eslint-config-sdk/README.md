<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK eslint config

[![npm version](https://img.shields.io/npm/v/@sentry/eslint-config-sdk.svg)](https://www.npmjs.com/package/@sentry/eslint-config-sdk)
[![npm dm](https://img.shields.io/npm/dm/@sentry/eslint-config-sdk.svg)](https://www.npmjs.com/package/@sentry/eslint-config-sdk)
[![npm dt](https://img.shields.io/npm/dt/@sentry/eslint-config-sdk.svg)](https://www.npmjs.com/package/@sentry/eslint-config-sdk)

Shared ESLint configuration used at Sentry.

> [!NOTE]
> This package is an internal library published for use by Sentry-owned JavaScript SDK packages and repositories. It is
> not part of the public API contract and may change in any release. Do not rely on SemVer compatibility if you depend on
> it directly.

## Installation

```sh
yarn add --dev @sentry/eslint-config-sdk
```

## Configuration

The configuration's legacy `extends` name is `@sentry/sdk`. TypeScript consumers must set `parserOptions.project`
to their TypeScript configuration so that rules requiring type information can run:

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

See the [configuration entry point](./src/index.js) for the shared rule sets.

## Support

- [Report a bug](https://github.com/getsentry/sentry-javascript/issues/new/choose)
- [Contributing](https://github.com/getsentry/sentry-javascript/blob/develop/CONTRIBUTING.md)
