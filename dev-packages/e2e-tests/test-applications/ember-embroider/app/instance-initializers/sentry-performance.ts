import type ApplicationInstance from '@ember/application/instance';
import { instrumentAppInstancePerformance } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  instrumentAppInstancePerformance(appInstance, {
    minimumRunloopQueueDuration: 0,
    minimumComponentRenderDuration: 0,
  });
}

export default {
  initialize,
};
