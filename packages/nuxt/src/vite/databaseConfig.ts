import { addServerPlugin, createResolver } from '@nuxt/kit';
import { consoleSandbox } from '@sentry/core';
import type { Nuxt } from 'nuxt/schema';

/**
 * Sets up the database instrumentation.
 */
export function addDatabaseInstrumentation(nuxt: Nuxt): void {
  if (!nuxt.options.nitro?.experimental?.database) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log('[Sentry] No database configuration found. Skipping database instrumentation.');
    });

    return;
  }

  addServerPlugin(createResolver(import.meta.url).resolve('./runtime/plugins/database.server'));
}
