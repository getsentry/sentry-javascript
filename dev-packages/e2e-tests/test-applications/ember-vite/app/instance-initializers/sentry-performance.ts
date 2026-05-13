import type ApplicationInstance from '@ember/application/instance';
import { addIntegration, browserTracingIntegration } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  addIntegration(browserTracingIntegration({
    appInstance,
    minimumRunloopQueueDuration: 0,
    minimumComponentRenderDuration: 0,
  }));
}

export default {
  initialize,
};
