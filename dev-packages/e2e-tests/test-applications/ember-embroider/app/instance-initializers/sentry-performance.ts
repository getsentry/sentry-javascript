import type ApplicationInstance from '@ember/application/instance';
import { setupPerformance } from '@sentry/ember/performance';

export function initialize(appInstance: ApplicationInstance): void {
  setupPerformance(appInstance, {
    minimumRunloopQueueDuration: 0,
    minimumComponentRenderDuration: 0,
  });
}

export default {
  initialize,
};
