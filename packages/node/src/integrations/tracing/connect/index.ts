import { ConnectInstrumentation } from './vendored/instrumentation';
import type { IntegrationFn } from '@sentry/core';
import { captureException, defineIntegration } from '@sentry/core';
import { ensureIsWrapped, generateInstrumentOnce } from '@sentry/node-core';

type ConnectApp = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  use: (middleware: any) => void;
};

const INTEGRATION_NAME = 'Connect';

export const instrumentConnect = generateInstrumentOnce(INTEGRATION_NAME, () => new ConnectInstrumentation());

const _connectIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentConnect();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Connect](https://github.com/senchalabs/connect/).
 *
 * If you also want to capture errors, you need to call `setupConnectErrorHandler(app)` after you initialize your connect app.
 *
 * For more information, see the [connect documentation](https://docs.sentry.io/platforms/javascript/guides/connect/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.connectIntegration()],
 * })
 * ```
 */
export const connectIntegration = defineIntegration(_connectIntegration);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function connectErrorMiddleware(err: any, req: any, res: any, next: any): void {
  captureException(err, {
    mechanism: {
      handled: false,
      type: 'auto.middleware.connect',
    },
  });
  next(err);
}

/**
 * Add a Connect middleware to capture errors to Sentry.
 *
 * @param app The Connect app to attach the error handler to
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 * const connect = require("connect");
 *
 * const app = connect();
 *
 * Sentry.setupConnectErrorHandler(app);
 *
 * // Add you connect routes here
 *
 * app.listen(3000);
 * ```
 */
export const setupConnectErrorHandler = (app: ConnectApp): void => {
  app.use(connectErrorMiddleware);
  ensureIsWrapped(app.use, 'connect');
};
