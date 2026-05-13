import type ApplicationInstance from '@ember/application/instance';
import { instrumentForPerformance, getSentryConfig } from '../utils/performance';

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
