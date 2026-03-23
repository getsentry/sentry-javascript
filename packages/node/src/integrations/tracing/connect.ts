// Automatic instrumentation for Connect using our portable core integration
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';

import type { ConnectIntegrationOptions, ConnectModule, IntegrationFn } from '@sentry/core';
import {
  patchConnectModule,
  setupConnectErrorHandler as coreSetupConnectErrorHandler,
  SDK_VERSION,
  defineIntegration,
} from '@sentry/core';
import { ensureIsWrapped, generateInstrumentOnce } from '@sentry/node-core';

type ConnectApp = {
  // oxlint-disable-next-line no-explicit-any
  use: (middleware: any) => void;
};

const INTEGRATION_NAME = 'Connect';
const SUPPORTED_VERSIONS = ['>=3.0.0 <4'];

export type ConnectInstrumentationConfig = InstrumentationConfig & Omit<ConnectIntegrationOptions, 'onRouteResolved'>;

export const instrumentConnect = generateInstrumentOnce(
  INTEGRATION_NAME,
  (options?: ConnectInstrumentationConfig) => new ConnectInstrumentation(options),
);

export class ConnectInstrumentation extends InstrumentationBase<ConnectInstrumentationConfig> {
  public constructor(config: ConnectInstrumentationConfig = {}) {
    super('sentry-connect', SDK_VERSION, config);
  }

  public init(): InstrumentationNodeModuleDefinition {
    let originalConnect: ConnectModule | undefined;

    return new InstrumentationNodeModuleDefinition(
      'connect',
      SUPPORTED_VERSIONS,
      connect => {
        originalConnect = connect as ConnectModule;
        return patchConnectModule(connect as ConnectModule, {
          onRouteResolved(route) {
            const rpcMetadata = getRPCMetadata(context.active());
            if (route && rpcMetadata?.type === RPCType.HTTP) {
              rpcMetadata.route = route;
            }
          },
        });
      },
      () => {
        return originalConnect;
      },
    );
  }
}

const _connectIntegration = ((options?: ConnectInstrumentationConfig) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentConnect(options);
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
 * // Add your connect routes here
 *
 * app.listen(3000);
 * ```
 */
export const setupConnectErrorHandler = (app: ConnectApp): void => {
  coreSetupConnectErrorHandler(app);
  ensureIsWrapped(app.use, 'connect');
};
