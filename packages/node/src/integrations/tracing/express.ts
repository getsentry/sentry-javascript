// Automatic istrumentation for Express using OTel
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';

import { generateInstrumentOnce } from '@sentry/node-core';
import {
  type ExpressIntegrationOptions,
  type IntegrationFn,
  debug,
  patchExpressModule,
  unpatchExpressModule,
  SDK_VERSION,
  defineIntegration,
} from '@sentry/core';
export { expressErrorHandler, setupExpressErrorHandler } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';

const INTEGRATION_NAME = 'Express';
const SUPPORTED_VERSIONS = ['>=4.0.0 <6'];

export type ExpressInstrumentationConfig = InstrumentationConfig & Omit<ExpressIntegrationOptions, 'express'>;

export const instrumentExpress = generateInstrumentOnce(
  INTEGRATION_NAME,
  (options?: ExpressInstrumentationConfig) =>
    new ExpressInstrumentation({
      ignoreLayers: options?.ignoreLayers,
      ignoreLayersType: options?.ignoreLayersType,
    }),
);

export class ExpressInstrumentation extends InstrumentationBase<ExpressInstrumentationConfig> {
  public constructor(config: ExpressInstrumentationConfig) {
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
          DEBUG_BUILD && debug.error('Failed to patch express module:', e);
        }
        return express
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
