import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';

import { ensureIsWrapped, registerModuleWrapper } from '@sentry/node-core';
import {
  type ExpressIntegrationOptions,
  type ExpressModuleExport,
  type IntegrationFn,
  debug,
  patchExpressModule,
  defineIntegration,
  setupExpressErrorHandler as coreSetupExpressErrorHandler,
  type ExpressHandlerOptions,
} from '@sentry/core';
export { expressErrorHandler } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';

const INTEGRATION_NAME = 'Express';
const MODULE_NAME = 'express';
const SUPPORTED_VERSIONS = ['>=4.0.0 <6'];

export function setupExpressErrorHandler(
  //oxlint-disable-next-line no-explicit-any
  app: { use: (middleware: any) => unknown },
  options?: ExpressHandlerOptions,
): void {
  coreSetupExpressErrorHandler(app, options);
  ensureIsWrapped(app.use, 'express');
}

export type ExpressInstrumentationConfig = Omit<ExpressIntegrationOptions, 'onRouteResolved'>;

/**
 * Instrument Express using registerModuleWrapper.
 * This registers hooks for both CJS and ESM module loading.
 *
 * Calling this multiple times is safe:
 * - Hooks are only registered once (first call)
 * - Options are updated on each call
 * - Use getOptions() in the patch to access current options at runtime
 */
export function instrumentExpress(options: ExpressInstrumentationConfig = {}): void {
  registerModuleWrapper<ExpressModuleExport, ExpressInstrumentationConfig>({
    moduleName: MODULE_NAME,
    supportedVersions: SUPPORTED_VERSIONS,
    options,
    patch: (moduleExports, getOptions) => {
      try {
        patchExpressModule(moduleExports, () => ({
          ...getOptions(),
          onRouteResolved(route) {
            const rpcMetadata = getRPCMetadata(context.active());
            if (route && rpcMetadata?.type === RPCType.HTTP) {
              rpcMetadata.route = route;
            }
          },
        }));
      } catch (e) {
        DEBUG_BUILD && debug.error('Failed to patch express module:', e);
      }
      return moduleExports;
    },
  });
}

// Add id property for compatibility with preloadOpenTelemetry logging
instrumentExpress.id = INTEGRATION_NAME;

const _expressIntegration = ((options?: ExpressInstrumentationConfig) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentExpress(options);
    },
  };
}) satisfies IntegrationFn;

export const expressIntegration = defineIntegration(_expressIntegration);
