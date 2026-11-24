## Nuxt modules

[Adding modules](../../dev-packages/e2e-tests/test-applications/nuxt-5/nuxt.config.ts) in the `modules` array.

Allows to integrate into the Nuxt lifecycle with build-time and runtime hooks.

Module Author Guide: https://nuxt.com/docs/4.x/guide/modules

## How the SDK is built

Entry Points: Client, server, types and module
[Rollup Config](./rollup.npm.config.mjs)

Build command in [package.json](./package.json)

## Module Overview

- Injects Sentry configs
  - Client: Using Plugin Template

- Adds server-side plugins (depending on Nitro version)
- Detects Netlify and Vercel environments

`autoInjectServerSentry` option:

- experimental
- wraps the server entry file

Most Server-related stuff happens in `nitro:init` hook

- Adds server config file to build
