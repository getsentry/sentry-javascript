// EXPERIMENTAL — entry point for `node --require @sentry/node/orchestrion app.js`.
//
// Installs orchestrion's CJS `_compile` patch with the central instrumentation
// config, and sets a global marker (`globalThis.__SENTRY_ORCHESTRION__.runtime`)
// so `detectOrchestrionSetup()` at `_experimentalSetupOrchestrion(client)` time
// can see that the runtime hook ran.
//
// This file is shipped as-is to `build/orchestrion/require-hook.cjs`. Keep it a
// single self-contained `.cjs` file with no relative-path requires — `--require`
// resolves it via Node's module resolution against the installed package's
// `./orchestrion` subpath export, which picks this file under the `require`
// condition and `import-hook.mjs` under the `import` condition.

'use strict';

const ModulePatch = require('@apm-js-collab/tracing-hooks');
const { SENTRY_INSTRUMENTATIONS } = require('../config');

const DEBUG = !!(process.env.DEBUG || process.env.debug || process.env.SENTRY_DEBUG);
// eslint-disable-next-line no-console
const debug = (...args) => DEBUG && console.log('[Sentry orchestrion]', ...args);

debug('require-hook.cjs loaded, instrumentations:', SENTRY_INSTRUMENTATIONS);

const g = (globalThis.__SENTRY_ORCHESTRION__ ??= {});
if (g.runtime) {
  // eslint-disable-next-line no-console
  console.warn('[Sentry] @sentry/node/orchestrion was loaded twice via --require. Ignoring the second load.');
} else {
  g.runtime = true;
  new ModulePatch({ instrumentations: SENTRY_INSTRUMENTATIONS }).patch();
  debug('ModulePatch.patch() called');
}
