export { Apollo, Express, GraphQL, Mongo, Mysql, Postgres, Prisma } from '@sentry-internal/tracing';

import { lazyLoadedNodePerformanceMonitoringIntegrations } from '@sentry-internal/tracing';
import type { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

/**
 * Automatically detects and returns integrations that will work with your dependencies.
 */
export function autoDiscoverNodePerformanceMonitoringIntegrations(): Integration[] {
  const loadedIntegrations = lazyLoadedNodePerformanceMonitoringIntegrations
    .map(tryLoad => {
      try {
        return tryLoad();
      } catch (_) {
        return undefined;
      }
    })
    .filter(integration => !!integration) as Integration[];

  if (loadedIntegrations.length === 0) {
    logger.warn('Performance monitoring integrations could not be automatically loaded.');
  }

  return loadedIntegrations;
}
