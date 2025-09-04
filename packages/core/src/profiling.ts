import { getClient } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import type { Profiler, ProfilingIntegration } from './types-hoist/profiling';
import { debug } from './utils/debug-logger';

function isProfilingIntegrationWithProfiler(
  integration: ProfilingIntegration | undefined,
): integration is ProfilingIntegration {
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
 */
function startProfiler(): void {
  const client = getClient();
  if (!client) {
    DEBUG_BUILD && debug.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName<ProfilingIntegration>('ProfilingIntegration');

  if (!integration) {
    DEBUG_BUILD && debug.warn('ProfilingIntegration is not available');
    return;
  }

  if (!isProfilingIntegrationWithProfiler(integration)) {
    DEBUG_BUILD && debug.warn('Profiler is not available on profiling integration.');
    return;
  }

  integration._profiler.start();
}

/**
 * Stops the Sentry continuous profiler.
 * Calls to stop will stop the profiler and flush the currently collected profile data to Sentry.
 */
function stopProfiler(): void {
  const client = getClient();
  if (!client) {
    DEBUG_BUILD && debug.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName<ProfilingIntegration>('ProfilingIntegration');
  if (!integration) {
    DEBUG_BUILD && debug.warn('ProfilingIntegration is not available');
    return;
  }

  if (!isProfilingIntegrationWithProfiler(integration)) {
    DEBUG_BUILD && debug.warn('Profiler is not available on profiling integration.');
    return;
  }

  integration._profiler.stop();
}

export const profiler: Profiler = {
  startProfiler,
  stopProfiler,
};
