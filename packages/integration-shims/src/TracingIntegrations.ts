import { consoleSandbox, defineIntegration } from '@sentry/core';

/**
 * Creates a shim for one of the integrations that make up `browserTracingIntegration`.
 * It is needed in order for the CDN bundles to continue working when users add/remove tracing
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
function makeTracingIntegrationShim(name: string, functionName: string): ReturnType<typeof defineIntegration> {
  return defineIntegration((_options?: unknown) => {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(`You are using ${functionName}() even though this bundle does not include tracing.`);
    });

    return {
      name,
    };
  });
}

/**
 * This is a shim for the `browserTracingCoreIntegration`.
 */
export const browserTracingCoreIntegrationShim = makeTracingIntegrationShim(
  'BrowserTracing',
  'browserTracingCoreIntegration',
);

/**
 * This is a shim for the `longTasksIntegration`.
 */
export const longTasksIntegrationShim = makeTracingIntegrationShim('LongTasks', 'longTasksIntegration');

/**
 * This is a shim for the `resourcesIntegration`.
 */
export const resourcesIntegrationShim = makeTracingIntegrationShim('Resources', 'resourcesIntegration');

/**
 * This is a shim for the `fetchTracingIntegration`.
 */
export const fetchTracingIntegrationShim = makeTracingIntegrationShim('FetchTracing', 'fetchTracingIntegration');

/**
 * This is a shim for the `xhrTracingIntegration`.
 */
export const xhrTracingIntegrationShim = makeTracingIntegrationShim('XhrTracing', 'xhrTracingIntegration');

/**
 * This is a shim for the `linkedTracesIntegration`.
 */
export const linkedTracesIntegrationShim = makeTracingIntegrationShim('LinkedTraces', 'linkedTracesIntegration');
