import type ApplicationInstance from '@ember/application/instance';
import * as Sentry from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  Sentry.instrumentAppInstancePerformance(appInstance, {
    minimumRunloopQueueDuration: 0,
    minimumComponentRenderDuration: 0,
  });
}

export default {
  initialize,
  name: 'sentry-performance',
};
