# SDK Tooling

The `@sentry/typescript`, `@sentry/eslint-config-sdk`, and `@sentry/eslint-plugin-sdk` packages share development
configuration across Sentry-owned JavaScript packages and repositories. They are internal packages, are not part of
the public API contract, and may change in any release without SemVer compatibility for direct consumers.

This repository uses Oxlint and Oxfmt through `yarn lint` and `yarn format`. The ESLint packages below serve existing
consumers of Sentry's shared ESLint tooling.

## TypeScript Configuration

Install the shared configuration as a development dependency:

```sh
yarn add --dev @sentry/typescript
```

Extend it from your project's `tsconfig.json`, adjusting the paths for your project:

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

The [shared configuration](../packages/typescript/tsconfig.json) is the source of truth for its compiler options.

## ESLint Configuration

Existing ESLint consumers can install the shared configuration as a development dependency:

```sh
yarn add --dev @sentry/eslint-config-sdk
```

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

See the [configuration entry point](../packages/eslint-config-sdk/src/index.js) for the shared rule sets.

## ESLint Plugin

`@sentry/eslint-plugin-sdk` provides custom rules used by Sentry's shared ESLint configuration.
The [plugin entry point](../packages/eslint-plugin-sdk/src/index.js) lists the available rules, and their
[implementations](../packages/eslint-plugin-sdk/src/rules) describe the checks they perform.
