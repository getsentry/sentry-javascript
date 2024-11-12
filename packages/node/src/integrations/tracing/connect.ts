import { ConnectInstrumentation } from '@opentelemetry/instrumentation-connect';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getClient,
  spanToJSON,
} from '@sentry/core';
import type { IntegrationFn, Span } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';
import { ensureIsWrapped } from '../../utils/ensureIsWrapped';

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
  captureException(err);
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

  // Sadly, ConnectInstrumentation has no requestHook, so we need to add the attributes here
  // We register this hook in this method, because if we register it in the integration `setup`,
  // it would always run even for users that are not even using connect
  const client = getClient();
  if (client) {
    client.on('spanStart', span => {
      addConnectSpanAttributes(span);
    });
  }

  ensureIsWrapped(app.use, 'connect');
};

function addConnectSpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data || {};

  // this is one of: middleware, request_handler
  const type = attributes['connect.type'];

  // If this is already set, or we have no connect span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.connect',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.connect`,
  });

  // Also update the name, we don't need to "middleware - " prefix
  const name = attributes['connect.name'];
  if (typeof name === 'string') {
    span.updateName(name);
  }
}
