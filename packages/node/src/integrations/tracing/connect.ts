import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ConnectInstrumentation } from '@opentelemetry/instrumentation-connect';
import { captureException, defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

type ConnectApp = {
  use: (middleware: any) => void;
};

const _connectIntegration = (() => {
  return {
    name: 'Connect',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new ConnectInstrumentation({})],
      });
    },
  };
}) satisfies IntegrationFn;

export const connectIntegration = defineIntegration(_connectIntegration);

function connectErrorMiddleware(err: any, req: any, res: any, next: any): void {
  captureException(err);
  next(err);
}

export const setupConnectErrorHandler = (app: ConnectApp): void => {
  app.use(connectErrorMiddleware);
};
