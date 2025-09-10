import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import ModulePatch from '@apm-js-collab/tracing-hooks';
import { debug, GLOBAL_OBJ } from '@sentry/core';
import * as moduleModule from 'module';
import { supportsEsmLoaderHooks } from '../utils/detection';

let instrumentationConfigs: InstrumentationConfig[] | undefined;

/**
 * Add an instrumentation config to be used by the injection loader.
 *
 * This should be called before `initializeInjectionLoader` is called.
 */
export function addInstrumentationConfig(config: InstrumentationConfig): void {
  if (!instrumentationConfigs) {
    instrumentationConfigs = [];
  }

  instrumentationConfigs.push(config);
}

/**
 * Initialize the injection loader - This method is private and not part of the public
 * API.
 *
 * @ignore
 */
export function initializeInjectionLoader(): void {
  if (!supportsEsmLoaderHooks()) {
    return;
  }

  if (!GLOBAL_OBJ._sentryInjectLoaderHookRegistered) {
    GLOBAL_OBJ._sentryInjectLoaderHookRegistered = true;

    const instrumentations = instrumentationConfigs || [];
    if (instrumentations.length === 0) {
      return;
    }

    const packages = new Set(instrumentations.map(i => i.module.name));

    // Patch require to support CJS modules
    const requirePatch = new ModulePatch({ instrumentations, packages });
    requirePatch.patch();

    // Add ESM loader to support ESM modules
    try {
      // @ts-expect-error register is available in these versions
      moduleModule.register('@apm-js-collab/tracing-hooks/hook.mjs', import.meta.url, {
        data: { instrumentations, packages },
      });
    } catch (error) {
      debug.warn("Failed to register '@apm-js-collab/tracing-hooks' hook", error);
    }
  }
}
