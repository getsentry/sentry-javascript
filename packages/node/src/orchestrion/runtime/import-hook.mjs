// EXPERIMENTAL — entry point for `node --import @sentry/node/orchestrion app.js`.
//
// Registers the orchestrion ESM loader with the central instrumentation config,
// and sets a global marker (`globalThis.__SENTRY_ORCHESTRION__.runtime`) so
// `detectOrchestrionSetup()` at `_experimentalSetupOrchestrion(client)` time can
// see that the runtime hook ran.
//
// This file is shipped as-is to `build/orchestrion/import-hook.mjs`. Keep it a
// single self-contained `.mjs` file with no relative-path imports — `--import`
// resolves it via Node's module resolution against the installed package.

import { createRequire } from 'node:module';
import { register } from 'node:module';
import { SENTRY_INSTRUMENTATIONS } from '@sentry/node/orchestrion/config';

const DEBUG = !!(process.env.DEBUG || process.env.debug || process.env.SENTRY_DEBUG);
// eslint-disable-next-line no-console
const debug = (...args) => DEBUG && console.log('[Sentry orchestrion]', ...args);

debug('import-hook.mjs loaded, instrumentations:', SENTRY_INSTRUMENTATIONS);

const g = (globalThis.__SENTRY_ORCHESTRION__ ??= {});
if (g.runtime) {
  // eslint-disable-next-line no-console
  console.warn('[Sentry] @sentry/node/orchestrion was loaded twice via --import. Ignoring the second load.');
} else {
  g.runtime = true;

  // ESM loader for `import`-ed modules.
  register('@apm-js-collab/tracing-hooks/hook.mjs', import.meta.url, {
    data: { instrumentations: SENTRY_INSTRUMENTATIONS },
  });
  debug('module.register() called for @apm-js-collab/tracing-hooks/hook.mjs');

  // ALSO patch `Module.prototype._compile` for the CJS side: when an ESM file
  // `import`s a CJS package (e.g. `import mysql from 'mysql'`), Node loads the
  // package's entry through the ESM bridge but resolves the package's INTERNAL
  // `require()` calls (mysql/index.js → `require('./lib/Connection.js')`)
  // through the CJS machinery. Those internal requires never reach the ESM
  // resolve hook, so without this patch the file we actually want to instrument
  // (mysql/lib/Connection.js) is loaded untransformed.
  const require = createRequire(import.meta.url);
  const ModulePatch = require('@apm-js-collab/tracing-hooks');
  new ModulePatch({ instrumentations: SENTRY_INSTRUMENTATIONS }).patch();
  debug('Module.patch() called for CJS-internal requires');
}
