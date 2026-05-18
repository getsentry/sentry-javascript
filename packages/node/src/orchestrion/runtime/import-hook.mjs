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

import Module from 'node:module';
import { SENTRY_INSTRUMENTATIONS } from '@sentry/node/orchestrion/config';
import { initialize, resolve, load } from '@apm-js-collab/tracing-hooks/hook-sync.mjs'
import ModulePatch from '@apm-js-collab/tracing-hooks'

const DEBUG = !!(process.env.DEBUG || process.env.debug || process.env.SENTRY_DEBUG);
// eslint-disable-next-line no-console
const debug = (...args) => DEBUG && console.log('[Sentry orchestrion]', ...args);

// registerHooks is only stable in Node from 24.13.0 and 25.1.0
const version = (process.versions.node ?? '0.0.0')
  .split('.')
  .map(n => parseInt(n, 10))
const stableSyncHooks = version[0] > 25 ||
  version[0] === 25 && version[1] >= 1 ||
  version[0] === 24 && version[1] >= 13

debug('import-hook.mjs loaded, instrumentations:', SENTRY_INSTRUMENTATIONS);

const g = (globalThis.__SENTRY_ORCHESTRION__ ??= {});
if (g.runtime) {
  // eslint-disable-next-line no-console
  console.warn('[Sentry] @sentry/node/orchestrion was loaded twice via --import. Ignoring the second load.');
} else {
  g.runtime = true;

  if (stableSyncHooks && typeof Module.registerHooks === 'function') {
    initialize({ instrumentations: SENTRY_INSTRUMENTATIONS });
    Module.registerHooks({ resolve, load });
    debug('Module.registerHooks() called for ESM and CJS modules');
  } else if (typeof Module.register === 'function') {
  // ESM loader for `import`-ed modules.
  Module.register('@apm-js-collab/tracing-hooks/hook.mjs', import.meta.url, {
    data: { instrumentations: SENTRY_INSTRUMENTATIONS },
  });
  debug('Module.register() called for ESM modules');

  // ALSO patch `Module.prototype._compile` for the CJS side: when an ESM file
  // `import`s a CJS package (e.g. `import mysql from 'mysql'`), Node loads the
  // package's entry through the ESM bridge but resolves the package's INTERNAL
  // `require()` calls (mysql/index.js → `require('./lib/Connection.js')`)
  // through the CJS machinery. Those internal requires never reach the ESM
  // resolve hook, so without this patch the file we actually want to instrument
  // (mysql/lib/Connection.js) is loaded untransformed.
  new ModulePatch({ instrumentations: SENTRY_INSTRUMENTATIONS }).patch();
  debug('Module.patch() called for CJS-internal requires');
}
