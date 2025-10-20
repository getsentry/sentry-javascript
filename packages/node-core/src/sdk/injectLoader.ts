import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import ModulePatch from '@apm-js-collab/tracing-hooks';
import { debug, GLOBAL_OBJ } from '@sentry/core';
import * as moduleModule from 'module';
import { supportsEsmLoaderHooks } from '../utils/detection';

let instrumentationConfigs: InstrumentationConfig[] | undefined;

/**
 * Add an instrumentation config to be used by the injection loader.
 */
export function addInstrumentationConfig(config: InstrumentationConfig): void {
  if (!supportsEsmLoaderHooks()) {
    return;
  }

  if (!instrumentationConfigs) {
    instrumentationConfigs = [];
  }

  instrumentationConfigs.push(config);

  GLOBAL_OBJ._sentryInjectLoaderHookRegister = () => {
    if (GLOBAL_OBJ._sentryInjectLoaderHookRegistered) {
      return;
    }

    GLOBAL_OBJ._sentryInjectLoaderHookRegistered = true;

    const instrumentations = instrumentationConfigs || [];

    // Patch require to support CJS modules
    const requirePatch = new ModulePatch({ instrumentations });
    requirePatch.patch();

    // Add ESM loader to support ESM modules
    try {
      // @ts-expect-error register is available in these versions
      moduleModule.register('@apm-js-collab/tracing-hooks/hook.mjs', import.meta.url, {
        data: { instrumentations },
      });
    } catch (error) {
      debug.warn("Failed to register '@apm-js-collab/tracing-hooks' hook", error);
    }
  };
}
