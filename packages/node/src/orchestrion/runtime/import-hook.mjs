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

import { initialize, resolve, load } from '@apm-js-collab/tracing-hooks/hook-sync.mjs';
import ModulePatch from '@apm-js-collab/tracing-hooks';
import { SENTRY_INSTRUMENTATIONS } from '@sentry/node/orchestrion/config';

const DEBUG = !!(process.env.DEBUG || process.env.debug || process.env.SENTRY_DEBUG);
// eslint-disable-next-line no-console
const debug = (...args) => DEBUG && console.log('[Sentry orchestrion]', ...args);

debug('import-hook.mjs loaded, instrumentations:', SENTRY_INSTRUMENTATIONS);

// detection to decide module loader hooks to use
// registerHooks was present but not stable until 24.13 and 25.1
const version = (process.versions.node ?? '0.0.0').split('.').map(n => parseInt(n, 10));
const stableSyncHooks =
  version[0] > 25 || (version[0] === 25 && version[1] >= 1) || (version[0] === 24 && version[1] >= 13);

const g = (globalThis.__SENTRY_ORCHESTRION__ ??= {});

g.runtime = true;

if (typeof Module.registerHooks === 'function' && stableSyncHooks) {
  initialize({ instrumentations: SENTRY_INSTRUMENTATIONS });
  Module.registerHooks({ resolve, load });
  debug('Module.registerHooks() called for @apm-js-collab/tracing-hooks/hook-sync.mjs');
} else if (typeof Module.register === 'function') {
  Module.register('@apm-js-collab/tracing-hooks/hook.mjs', import.meta.url, {
    data: { instrumentations: SENTRY_INSTRUMENTATIONS },
  });
  debug('Module.register() called for @apm-js-collab/tracing-hooks/hook.mjs');

  // ALSO patch `Module.prototype._compile` for the CJS side: when
  // an ESM file `import`s a CJS package, Node loads the package's
  // entry through the ESM bridge but resolves the package's
  // INTERNAL `require()` calls through the CJS machinery.
  // Those internal requires never reach the ESM resolve hook, so
  // without this patch the file we actually want to instrument is
  // loaded untransformed.
  // This isn't necessary in the registerHooks case, because Node
  // applies those hooks to all CJS and ESM modules.
  new ModulePatch({ instrumentations: SENTRY_INSTRUMENTATIONS }).patch();
} else {
  throw new Error('No available API to apply module load hooks');
}
