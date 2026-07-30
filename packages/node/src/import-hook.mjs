// The `--import` entry for `@sentry/node`, referenced as `node --import @sentry/node/import app.js`.
// It registers the orchestrion diagnostics-channel injection before the app loads, so
// channel-based integrations record spans even when `Sentry.init()` runs after the
// instrumented libraries are imported. All of the registration logic lives in
// `@sentry/server-utils/orchestrion/register`; this file is just the side-effecting wrapper.
//
// This file is shipped as-is to `build/import-hook.mjs` (see `rollup.npm.config.mjs`). Keep it a
// single self-contained `.mjs` with no relative-path imports — `--import` resolves it (and the bare
// specifier below) via Node's module resolution against the installed package.
import '@sentry/server-utils/orchestrion/import-hook';
