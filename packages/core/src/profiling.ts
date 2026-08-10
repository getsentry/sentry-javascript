import { getClient } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import type { Profiler, ProfilingIntegration } from './types/profiling';
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
 * Starts a manually controlled Sentry profiling session.
 *
 * Profiling starts only when the profiling integration sampled the current session and `profileLifecycle` is set to `manual`.
 * While running, the profiler periodically sends profile chunks to Sentry until `stopProfiler()` is called.
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
 * Stops a manually controlled Sentry profiling session.
 *
 * If a manual profiling session is running, stops the profiler and sends the currently collected profile chunk to Sentry.
 * Calls are ignored when using the trace lifecycle or when no profiling session is running.
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

/**
 * Profiler namespace for controlling the profiler in 'manual' mode.
 *
 * Requires the `nodeProfilingIntegration` from the `@sentry/profiling-node` package.
 */
export const profiler: Profiler = {
  startProfiler,
  stopProfiler,
};
