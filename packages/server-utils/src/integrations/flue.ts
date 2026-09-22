import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, GLOBAL_OBJ } from '@sentry/core';
import type { FlueOptions } from '../ai/flue';
import { createFlueInstrumentation } from '../ai/flue';
import { FLUE_INTEGRATION_NAME, FLUE_MODULE_NAME } from '../ai/flue/constants';
import { DEBUG_BUILD } from '../debug-build';

type FlueInstrumentFn = (instrumentation: ReturnType<typeof createFlueInstrumentation>) => unknown;

/**
 * The `instrument` we last registered against, so a second `setup()` in the same isolate is a
 * no-op. Cloudflare runs `init()` per request, and with `cacheClient: false` that reaches here
 * every time: in production Flue throws on the repeat, and under `vite dev` it disposes our
 * previous registration instead — ending the turn and tool spans of every in-flight request.
 *
 * Keyed on the binding rather than a bare boolean so a fresh `@flue/runtime` instance (a new
 * isolate reusing this module, a test swapping the marker) still registers.
 */
let registeredBinding: FlueInstrumentFn | undefined;

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

      if (instrument === registeredBinding) {
        DEBUG_BUILD && debug.log('[Flue] already registered in this isolate; skipping auto-registration');
        return;
      }

      try {
        instrument(createFlueInstrumentation(options));
        registeredBinding = instrument;
      } catch (error) {
        // Never rethrow: `setup()` runs inside `Sentry.init()`, which core calls unguarded and
        // Cloudflare calls per request, so throwing here would take down the request handler.
        if ((error as Error | undefined)?.name === 'InstrumentationAlreadyInstalledError') {
          // The app owns the key and we will never win it, so stop rebuilding the instrumentation
          // (two 1000-entry `LRUMap`s) on every later `init()`.
          registeredBinding = instrument;
          DEBUG_BUILD && debug.log('[Flue] already instrumented by the app; skipping auto-registration');
        } else {
          debug.warn('[Flue] auto-registration failed; Flue spans will not be recorded:', error);
        }
      }
    },
  };
}) satisfies IntegrationFn;

export const flueIntegration = defineIntegration(_flueIntegration);
