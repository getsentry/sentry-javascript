<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry TypeScript Configuration

[![npm version](https://img.shields.io/npm/v/@sentry/typescript.svg)](https://www.npmjs.com/package/@sentry/typescript)
[![npm dm](https://img.shields.io/npm/dm/@sentry/typescript.svg)](https://www.npmjs.com/package/@sentry/typescript)
[![npm dt](https://img.shields.io/npm/dt/@sentry/typescript.svg)](https://www.npmjs.com/package/@sentry/typescript)

Shared TypeScript configuration used at Sentry.

> [!NOTE]
> This package is an internal library published for use by Sentry-owned JavaScript SDK packages and repositories. It is
> not part of the public API contract and may change in any release. Do not rely on SemVer compatibility if you depend on
> it directly.

## Installation

```sh
yarn add --dev @sentry/typescript
```

## Usage

Extend the shared configuration from your project's `tsconfig.json`, adjusting the paths for your project:

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

See the [shared configuration](./tsconfig.json) for its compiler options. This package's
[parent repository](https://github.com/getsentry/sentry-javascript) provides an example of using it in a monorepo.

## Support

- [Report a bug](https://github.com/getsentry/sentry-javascript/issues/new/choose)
- [Contributing](https://github.com/getsentry/sentry-javascript/blob/develop/CONTRIBUTING.md)
