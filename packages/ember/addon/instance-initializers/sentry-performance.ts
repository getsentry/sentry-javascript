/* eslint-disable max-lines */
import type ApplicationInstance from '@ember/application/instance';
import { getOwnConfig } from '@embroider/macros';
import { GLOBAL_OBJ } from '@sentry/core';
import type { EmberSentryConfig, GlobalConfig, OwnConfig } from '../types';
import { instrumentForPerformance } from '../utils/performance';

function getSentryConfig(): EmberSentryConfig {
  const _global = GLOBAL_OBJ as typeof GLOBAL_OBJ & GlobalConfig;
  _global.__sentryEmberConfig = _global.__sentryEmberConfig ?? {};
  const environmentConfig = getOwnConfig<OwnConfig>().sentryConfig;
  if (!environmentConfig.sentry) {
    environmentConfig.sentry = {
      browserTracingOptions: {},
    };
  }
  Object.assign(environmentConfig.sentry, _global.__sentryEmberConfig);
  return environmentConfig;
}

export function initialize(appInstance: ApplicationInstance): void {
  // Disable in fastboot - we only want to run Sentry client-side
  const fastboot = appInstance.lookup('service:fastboot') as unknown as { isFastBoot: boolean } | undefined;
  if (fastboot?.isFastBoot) {
    return;
  }

  const config = getSentryConfig();
  if (config['disablePerformance']) {
    return;
  }

  // Run this in the next tick to ensure the ember router etc. is properly initialized
  instrumentForPerformance(appInstance);
}

export default {
  initialize,
  name: 'sentry-performance',
};
