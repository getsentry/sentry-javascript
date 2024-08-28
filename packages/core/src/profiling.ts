import { logger } from '@sentry/utils';
import { ProfilingIntegration, Profiler } from '@sentry/types';

import { DEBUG_BUILD } from "./debug-build";
import { getClient } from "./currentScopes";

/**
 *
 */
function startProfiler() {
  const client = getClient()
  if (!client) {
    DEBUG_BUILD && logger.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');
  if (!integration) {
    DEBUG_BUILD && logger.warn('ProfilingIntegration is not available');
    return
  }
  integration._profiler.start();
}

/**
 *
 */
function stopProfiler() {
  const client = getClient()
  if (!client) {
    DEBUG_BUILD && logger.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');
  if (!integration) {
    DEBUG_BUILD && logger.warn('ProfilingIntegration is not available');
    return
  }
  integration._profiler.stop();
}

export const profiler: Profiler = {
  startProfiler,
  stopProfiler
}
