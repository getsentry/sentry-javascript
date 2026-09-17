import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, GLOBAL_OBJ } from '@sentry/core';
import type { FlueOptions } from '../ai/flue';
import { createFlueInstrumentation } from '../ai/flue';
import { FLUE_INTEGRATION_NAME, FLUE_MODULE_NAME } from '../ai/flue/constants';
import { DEBUG_BUILD } from '../debug-build';

type FlueInstrumentFn = (instrumentation: ReturnType<typeof createFlueInstrumentation>) => unknown;

/**
 * Register the instrumentation with Flue on the user's behalf, when the runtime binding is available.
 *
 * Flue is registered rather than patched — `instrument()` writes into module-scope state — so this
 * needs a reference to that module's own binding. In a bundled worker there is no `node_modules` to
 * resolve one from, so `@sentry/cloudflare/vite` splices a static `@flue/runtime` import into this
 * module at build time and stashes the namespace on the global marker. Outside that setup the marker
 * is empty and this no-ops, leaving the user's own `instrument(Sentry.createFlueInstrumentation())`
 * as the way in.
 */
const _flueIntegration = ((options: FlueOptions = {}) => {
  return {
    name: FLUE_INTEGRATION_NAME,
    setup() {
      const provided = GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.providedModules?.[FLUE_MODULE_NAME];
      const instrument = provided?.instrument as FlueInstrumentFn | undefined;

      if (typeof instrument !== 'function') {
        DEBUG_BUILD && debug.log('[Flue] no provided `@flue/runtime` binding; skipping auto-registration');
        return;
      }

      try {
        instrument(createFlueInstrumentation(options));
      } catch (error) {
        // A repeated `instrument()` throws `InstrumentationAlreadyInstalledError`, which is what an
        // app that also registers manually will hit. Its own registration is already in place, so
        // there is nothing to recover.
        DEBUG_BUILD && debug.log('[Flue] auto-registration skipped:', error);
      }
    },
  };
}) satisfies IntegrationFn;

export const flueIntegration = defineIntegration(_flueIntegration);
