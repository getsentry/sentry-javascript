import type { Profiler } from '@sentry/core';
import { debug, getClient } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

/**
 * Starts a manually controlled Sentry UI profiling session.
 *
 * Profiling starts only when the integration sampled the current session and `profileLifecycle` is `manual`.
 * While running, the profiler periodically sends profile chunks to Sentry until `stopProfiler()` is called.
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
 * Stops a manually controlled Sentry UI profiling session.
 *
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
