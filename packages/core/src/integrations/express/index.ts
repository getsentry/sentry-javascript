/**
 * Platform-portable Express tracing integration.
 *
 * @module
 *
 * This Sentry integration is a derivative work based on the OpenTelemetry
 * Express instrumentation.
 *
 * <https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-express>
 *
 * Extended under the terms of the Apache 2.0 license linked below:
 *
 * ----
 *
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { debug } from '../../utils/debug-logger';
import { captureException } from '../../exports';
import { DEBUG_BUILD } from '../../debug-build';
import type {
  ExpressApplication,
  ExpressErrorMiddleware,
  ExpressHandlerOptions,
  ExpressIntegrationOptions,
  ExpressLayer,
  ExpressMiddleware,
  ExpressModuleExport,
  ExpressRequest,
  ExpressResponse,
  ExpressRouter,
  ExpressRouterv4,
  ExpressRouterv5,
  MiddlewareError,
} from './types';
import {
  defaultShouldHandleError,
  getLayerPath,
  isExpressWithoutRouterPrototype,
  isExpressWithRouterPrototype,
} from './utils';
import { wrapMethod } from '../../utils/object';
import { patchLayer } from './patch-layer';
import { setSDKProcessingMetadata } from './set-sdk-processing-metadata';
import { getDefaultExport } from '../../utils/get-default-export';

function isLegacyOptions(
  options: ExpressModuleExport | (ExpressIntegrationOptions & { express: ExpressModuleExport }),
): options is ExpressIntegrationOptions & { express: ExpressModuleExport } {
  return !!(options as { express: ExpressModuleExport }).express;
}

// TODO: remove this deprecation handling in v11
let didLegacyDeprecationWarning = false;
function deprecationWarning() {
  if (!didLegacyDeprecationWarning) {
    didLegacyDeprecationWarning = true;
    DEBUG_BUILD &&
      debug.warn(
        '[Express] `patchExpressModule(options)` is deprecated. Use `patchExpressModule(moduleExports, getOptions)` instead.',
      );
  }
}

/**
 * This is a portable instrumentatiton function that works in any environment
 * where Express can be loaded, without depending on OpenTelemetry.
 *
 * @example
 * ```javascript
 * import express from 'express';
 * import * as Sentry from '@sentry/deno'; // or any SDK that extends core
 *
 * Sentry.patchExpressModule(express, () => ({}));
 * ```
 */
export function patchExpressModule(
  moduleExports: ExpressModuleExport,
  getOptions: () => ExpressIntegrationOptions,
): ExpressModuleExport;
/**
 * @deprecated Pass the Express module export as the first argument and options getter as the second argument.
 */
export function patchExpressModule(
  options: ExpressIntegrationOptions & { express: ExpressModuleExport },
): ExpressModuleExport;
export function patchExpressModule(
  optionsOrExports: ExpressModuleExport | (ExpressIntegrationOptions & { express: ExpressModuleExport }),
  maybeGetOptions?: () => ExpressIntegrationOptions,
): ExpressModuleExport {
  let getOptions: () => ExpressIntegrationOptions;
  let moduleExports: ExpressModuleExport;
  if (!maybeGetOptions && isLegacyOptions(optionsOrExports)) {
    const { express, ...options } = optionsOrExports;
    moduleExports = express;
    getOptions = () => options;
    deprecationWarning();
  } else if (typeof maybeGetOptions !== 'function') {
    throw new TypeError('`patchExpressModule(moduleExports, getOptions)` requires a `getOptions` callback');
  } else {
    getOptions = maybeGetOptions;
    moduleExports = optionsOrExports as ExpressModuleExport;
  }

  // pass in the require() or import() result of express
  const express = getDefaultExport(moduleExports);
  const routerProto: ExpressRouterv4 | ExpressRouterv5 | undefined = isExpressWithRouterPrototype(express)
    ? express.Router.prototype // Express v5
    : isExpressWithoutRouterPrototype(express)
      ? express.Router // Express v4
      : undefined;

  if (!routerProto) {
    throw new TypeError('no valid Express route function to instrument');
  }

  // oxlint-disable-next-line @typescript-eslint/unbound-method
  const originalRouteMethod = routerProto.route;
  try {
    wrapMethod(
      routerProto,
      'route',
      function routeTrace(this: ExpressRouter, ...args: Parameters<typeof originalRouteMethod>[]) {
        const route = originalRouteMethod.apply(this, args);
        const layer = this.stack[this.stack.length - 1] as ExpressLayer;
        patchLayer(getOptions, layer, getLayerPath(args));
        return route;
      },
    );
  } catch (e) {
    DEBUG_BUILD && debug.error('Failed to patch express route method:', e);
  }

  // oxlint-disable-next-line @typescript-eslint/unbound-method
  const originalRouterUse = routerProto.use;
  try {
    wrapMethod(
      routerProto,
      'use',
      function useTrace(this: ExpressApplication, ...args: Parameters<typeof originalRouterUse>) {
        const route = originalRouterUse.apply(this, args);
        const layer = this.stack[this.stack.length - 1];
        if (!layer) {
          return route;
        }
        patchLayer(getOptions, layer, getLayerPath(args));
        return route;
      },
    );
  } catch (e) {
    DEBUG_BUILD && debug.error('Failed to patch express use method:', e);
  }

  const { application } = express;
  const originalApplicationUse = application.use;
  try {
    wrapMethod(
      application,
      'use',
      function appUseTrace(
        this: ExpressApplication & {
          _router?: ExpressRouter;
          router?: ExpressRouter;
        },
        ...args: Parameters<ExpressApplication['use']>
      ) {
        // If we access app.router in express 4.x we trigger an assertion error.
        // This property existed in v3, was removed in v4 and then re-added in v5.
        const route = originalApplicationUse.apply(this, args);
        const router = isExpressWithRouterPrototype(express) ? this.router : this._router;
        if (router) {
          const layer = router.stack[router.stack.length - 1];
          if (layer) {
            patchLayer(getOptions, layer, getLayerPath(args));
          }
        }
        return route;
      },
    );
  } catch (e) {
    DEBUG_BUILD && debug.error('Failed to patch express application.use method:', e);
  }

  return express;
}

/**
 * An Express-compatible error handler, used by setupExpressErrorHandler
 */
export function expressErrorHandler(options?: ExpressHandlerOptions): ExpressErrorMiddleware {
  return function sentryErrorMiddleware(
    error: MiddlewareError,
    request: ExpressRequest,
    res: ExpressResponse,
    next: (error: MiddlewareError) => void,
  ): void {
    // When an error happens, the `expressRequestHandler` middleware does not run, so we set it here too
    setSDKProcessingMetadata(request);
    const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;

    if (shouldHandleError(error)) {
      const eventId = captureException(error, {
        mechanism: { type: 'auto.middleware.express', handled: false },
      });
      (res as { sentry?: string }).sentry = eventId;
    }

    next(error);
  };
}

/**
 * Add an Express error handler to capture errors to Sentry.
 *
 * The error handler must be before any other middleware and after all controllers.
 *
 * @param app The Express instances
 * @param options {ExpressHandlerOptions} Configuration options for the handler
 *
 * @example
 * ```javascript
 * import * as Sentry from 'sentry/deno'; // or any other @sentry/<platform>
 * import * as express from 'express';
 *
 * Sentry.instrumentExpress(express);
 *
 * const app = express();
 *
 * // Add your routes, etc.
 *
 * // Add this after all routes,
 * // but before any and other error-handling middlewares are defined
 * Sentry.setupExpressErrorHandler(app);
 *
 * app.listen(3000);
 * ```
 */
export function setupExpressErrorHandler(
  app: {
    //oxlint-disable-next-line no-explicit-any
    use: (middleware: any) => unknown;
  },
  options?: ExpressHandlerOptions,
): void {
  app.use(expressRequestHandler());
  app.use(expressErrorHandler(options));
}

function expressRequestHandler(): ExpressMiddleware {
  return function sentryRequestMiddleware(request: ExpressRequest, _res: ExpressResponse, next: () => void): void {
    setSDKProcessingMetadata(request);
    next();
  };
}
