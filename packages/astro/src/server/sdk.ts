import { applySdkMetadata } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { getDefaultIntegrations } from '@sentry/node';
import { init as initNodeSdk, setTag } from '@sentry/node';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  const opts = {
    ...options,
    // TODO v8: For now, we disable the Prisma integration, because that has weird esm-cjs interop issues
    // We should figure these out and fix these before v8 goes stable.
    defaultIntegrations: getDefaultIntegrations(options).filter(integration => integration.name !== 'Prisma'),
  };
  applySdkMetadata(opts, 'astro', ['astro', 'node']);

  initNodeSdk(opts);

  setTag('runtime', 'node');
}
