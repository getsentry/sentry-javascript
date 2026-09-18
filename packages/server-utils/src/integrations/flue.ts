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
        // Never rethrow: `setup()` runs inside `Sentry.init()`, which core calls unguarded and
        // Cloudflare calls per request, so throwing here would take down the request handler.
        if ((error as Error | undefined)?.name === 'InstrumentationAlreadyInstalledError') {
          DEBUG_BUILD && debug.log('[Flue] already instrumented by the app; skipping auto-registration');
        } else {
          debug.warn('[Flue] auto-registration failed; Flue spans will not be recorded:', error);
        }
      }
    },
  };
}) satisfies IntegrationFn;

export const flueIntegration = defineIntegration(_flueIntegration);
