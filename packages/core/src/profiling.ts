import type { Profiler, ProfilingIntegration } from './types-hoist';

import { getClient } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import { logger } from './utils-hoist/logger';

function isProfilingIntegrationWithProfiler(
  integration: ProfilingIntegration<any> | undefined,
): integration is ProfilingIntegration<any> {
  return (
    !!integration &&
    typeof integration['_profiler'] !== 'undefined' &&
    typeof integration['_profiler']['start'] === 'function' &&
    typeof integration['_profiler']['stop'] === 'function'
  );
}
/**
 * Starts the Sentry continuous profiler.
 * This mode is exclusive with the transaction profiler and will only work if the profilesSampleRate is set to a falsy value.
 * In continuous profiling mode, the profiler will keep reporting profile chunks to Sentry until it is stopped, which allows for continuous profiling of the application.
 * @deprecated Use `startProfileSession()` instead.
 */
function startProfiler(): void {
  const client = getClient();
  if (!client) {
    DEBUG_BUILD && logger.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');

  if (!integration) {
    DEBUG_BUILD && logger.warn('ProfilingIntegration is not available');
    return;
  }

  if (!isProfilingIntegrationWithProfiler(integration)) {
    DEBUG_BUILD && logger.warn('Profiler is not available on profiling integration.');
    return;
  }

  integration._profiler.start();
}

/**
 * Stops the Sentry continuous profiler.
 * Calls to stop will stop the profiler and flush the currently collected profile data to Sentry.
 * @deprecated Use `stopProfilerSession()` instead.
 */
function stopProfiler(): void {
  const client = getClient();
  if (!client) {
    DEBUG_BUILD && logger.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');
  if (!integration) {
    DEBUG_BUILD && logger.warn('ProfilingIntegration is not available');
    return;
  }

  if (!isProfilingIntegrationWithProfiler(integration)) {
    DEBUG_BUILD && logger.warn('Profiler is not available on profiling integration.');
    return;
  }

  integration._profiler.stop();
}

/**
 * Starts a new profiler session.
 */
function startProfileSession(): void {
  const client = getClient();
  if (!client) {
    DEBUG_BUILD && logger.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');
  if (!integration) {
    DEBUG_BUILD && logger.warn('ProfilingIntegration is not available');
    return;
  }

  if (!isProfilingIntegrationWithProfiler(integration)) {
    DEBUG_BUILD && logger.warn('Profiler is not available on profiling integration.');
    return;
  }

  integration._profiler.startProfileSession();
}

/**
 * Stops the current profiler session.
 */
function stopProfileSession(): void {
    const client = getClient();
    if (!client) {
      DEBUG_BUILD && logger.warn('No Sentry client available, profiling is not started');
      return;
    }

    const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');
    if (!integration) {
      DEBUG_BUILD && logger.warn('ProfilingIntegration is not available');
      return;
    }

    if (!isProfilingIntegrationWithProfiler(integration)) {
      DEBUG_BUILD && logger.warn('Profiler is not available on profiling integration.');
      return;
    }

    integration._profiler.stopProfileSession();
}

export const profiler: Profiler = {
  startProfiler,
  stopProfiler,
  startProfileSession,
  stopProfileSession,
};
