import type { Profiler } from '@sentry/core';
import { debug, getClient } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

/**
 * Starts the Sentry UI profiler.
 * This mode is exclusive with the transaction profiler and will only work if the profilesSampleRate is set to a falsy value.
 * In UI profiling mode, the profiler will keep reporting profile chunks to Sentry until it is stopped, which allows for continuous profiling of the application.
 */
function startProfiler(): void {
  const client = getClient();
  if (!client) {
    DEBUG_BUILD && debug.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName('BrowserProfiling');

  if (!integration) {
    DEBUG_BUILD && debug.warn('BrowserProfiling integration is not available');
    return;
  }

  client.emit('startUIProfiler');
}

/**
 * Stops the Sentry UI profiler.
 * Calls to stop will stop the profiler and flush the currently collected profile data to Sentry.
 */
function stopProfiler(): void {
  const client = getClient();
  if (!client) {
    DEBUG_BUILD && debug.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName('BrowserProfiling');
  if (!integration) {
    DEBUG_BUILD && debug.warn('ProfilingIntegration is not available');
    return;
  }

  client.emit('stopUIProfiler');
}

/**
 * Profiler namespace for controlling the JS profiler in 'manual' mode.
 *
 * Requires the `browserProfilingIntegration` from the `@sentry/browser` package.
 */
export const uiProfiler: Profiler = {
  startProfiler,
  stopProfiler,
};
