import { debug, GLOBAL_OBJ } from '@sentry/core';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import * as moduleModule from 'module';
import { supportsEsmLoaderHooks } from '../utils/detection';

/**
 * Initialize the ESM loader - This method is private and not part of the public
 * API.
 *
 * @ignore
 */
export function initializeEsmLoader(): void {
  if (!supportsEsmLoaderHooks()) {
    return;
  }

  if (!GLOBAL_OBJ._sentryEsmLoaderHookRegistered) {
    GLOBAL_OBJ._sentryEsmLoaderHookRegistered = true;

    try {
      const { addHookMessagePort } = createAddHookMessageChannel();
      // @ts-expect-error register is available in these versions
      moduleModule.register('import-in-the-middle/hook.mjs', import.meta.url, {
        data: { addHookMessagePort, include: [] },
        transferList: [addHookMessagePort],
      });
    } catch (error) {
      debug.warn("Failed to register 'import-in-the-middle' hook", error);
    }
  }
}
