import { ConnectInstrumentation } from '@opentelemetry/instrumentation-connect';
import { captureException, defineIntegration } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

type ConnectApp = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  use: (middleware: any) => void;
};

const _connectIntegration = (() => {
  return {
    name: 'Connect',
    setupOnce() {
      addOpenTelemetryInstrumentation(new ConnectInstrumentation({}));
    },
  };
}) satisfies IntegrationFn;

export const connectIntegration = defineIntegration(_connectIntegration);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function connectErrorMiddleware(err: any, req: any, res: any, next: any): void {
  captureException(err);
  next(err);
}

export const setupConnectErrorHandler = (app: ConnectApp): void => {
  app.use(connectErrorMiddleware);
};
