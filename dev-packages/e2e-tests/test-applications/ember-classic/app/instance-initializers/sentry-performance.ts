import type ApplicationInstance from '@ember/application/instance';
import { instrumentAppInstancePerformance } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  instrumentAppInstancePerformance(appInstance, {
    minimumRunloopQueueDuration: 0,
    minimumComponentRenderDuration: 0,
    // Off by default, enabled here so the suite covers `ui.resolve` spans.
    enableComponentDefinitions: true,
  });
}

export default {
  initialize,
};
