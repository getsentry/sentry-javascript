import type { LazyLoadedIntegration } from '@sentry-internal/tracing';
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
    .filter(integration => !!integration) as LazyLoadedIntegration[];

  if (loadedIntegrations.length === 0) {
    logger.warn('Performance monitoring integrations could not be automatically loaded.');
  }

  // Only return integrations where their dependencies loaded successfully.
  return loadedIntegrations.filter(integration => !!integration.loadDependency());
}
