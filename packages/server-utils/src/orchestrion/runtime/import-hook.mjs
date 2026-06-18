// EXPERIMENTAL — diagnostics-channel injection runtime hook. The side-effecting
// `--import` entry (e.g. `node --import @sentry/node/import app.js`) that injects
// the channels unconditionally before the app loads.
//
// All of the registration logic lives in `register.ts` — it has to be a
// CJS-compatible, dual-built module so `Sentry.init()` can `require()` it
// synchronously, and keeping a single source of truth means the `--import` path
// and the `init()` path can never drift apart. This file is just the
// side-effecting wrapper that invokes it.
//
// This file is shipped as-is to `build/orchestrion/import-hook.mjs`. Keep it a
// single self-contained `.mjs` file with no relative-path imports — `--import`
// resolves it (and the bare specifier below) via Node's module resolution
// against the installed package.

import { registerDiagnosticsChannelInjection } from '@sentry/server-utils/orchestrion/register';

registerDiagnosticsChannelInjection();
