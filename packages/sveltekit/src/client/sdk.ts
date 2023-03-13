import type { BrowserOptions } from '@sentry/svelte';
import { configureScope, init as initSvelteSdk } from '@sentry/svelte';

import { applySdkMetadata } from '../common/metadata';

/**
 *
 * @param options
 */
export function init(options: BrowserOptions): void {
  applySdkMetadata(options, ['sveltekit', 'svelte']);

  initSvelteSdk(options);

  configureScope(scope => {
    scope.setTag('runtime', 'browser');
  });
}
