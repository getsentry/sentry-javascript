// Automatic istrumentation for Express using OTel
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';

import { ensureIsWrapped, generateInstrumentOnce } from '@sentry/node-core';
import {
  type ExpressIntegrationOptions,
  type IntegrationFn,
  debug,
  patchExpressModule,
  unpatchExpressModule,
  SDK_VERSION,
  defineIntegration,
  setupExpressErrorHandler as coreSetupExpressErrorHandler,
  type ExpressHandlerOptions,
} from '@sentry/core';
export { expressErrorHandler } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';

const INTEGRATION_NAME = 'Express';
const SUPPORTED_VERSIONS = ['>=4.0.0 <6'];

export function setupExpressErrorHandler(
  //oxlint-disable-next-line no-explicit-any
  app: { use: (middleware: any) => unknown },
  options?: ExpressHandlerOptions,
): void {
  coreSetupExpressErrorHandler(app, options);
  ensureIsWrapped(app.use, 'express');
}

export type ExpressInstrumentationConfig = InstrumentationConfig &
  Omit<ExpressIntegrationOptions, 'express' | 'onRouteResolved'>;

export const instrumentExpress = generateInstrumentOnce(
  INTEGRATION_NAME,
  (options?: ExpressInstrumentationConfig) => new ExpressInstrumentation(options),
);

export class ExpressInstrumentation extends InstrumentationBase<ExpressInstrumentationConfig> {
  public constructor(config: ExpressInstrumentationConfig = {}) {
    super('sentry-express', SDK_VERSION, config);
  }
  public init(): InstrumentationNodeModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      'express',
      SUPPORTED_VERSIONS,
      express => {
        try {
          patchExpressModule({
            ...this.getConfig(),
            express,
            onRouteResolved(route) {
              const rpcMetadata = getRPCMetadata(context.active());
              if (route && rpcMetadata?.type === RPCType.HTTP) {
                rpcMetadata.route = route;
              }
            },
          });
        } catch (e) {
          DEBUG_BUILD && debug.error('Failed to patch express module:', e);
        }
        return express;
      },
      express => {
        try {
          unpatchExpressModule({ express });
        } catch (e) {
          DEBUG_BUILD && debug.error('Failed to unpatch express module:', e);
        }
        return express;
      },
    );
    return module;
  }
}

const _expressInstrumentation = ((options?: ExpressInstrumentationConfig) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentExpress(options);
    },
  };
}) satisfies IntegrationFn;

export const expressIntegration = defineIntegration(_expressInstrumentation);
