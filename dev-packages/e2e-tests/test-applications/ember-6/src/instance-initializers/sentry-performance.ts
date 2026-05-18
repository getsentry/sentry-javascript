import type ApplicationInstance from '@ember/application/instance';
import * as Sentry from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  Sentry.addIntegration(
    Sentry.browserTracingIntegration({
      appInstance,
    }),
  );
}

export default {
  initialize,
};
