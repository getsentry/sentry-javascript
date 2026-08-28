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

// This whole module backs the deprecated Express exports (superseded by `expressIntegration()`), so it
// references its own deprecated types/functions throughout.
/* oxlint-disable typescript/no-deprecated */

import { debug } from '../../utils/debug-logger';
import { DEBUG_BUILD } from '../../debug-build';
import type {
  ExpressApplication,
  ExpressIntegrationOptions,
  ExpressLayer,
  ExpressModuleExport,
  ExpressRouter,
  ExpressRouterv4,
  ExpressRouterv5,
} from './types';
import { getLayerPath, isExpressWithoutRouterPrototype, isExpressWithRouterPrototype } from './utils';
import { wrapMethod } from '../../utils/object';
import { patchLayer } from './patch-layer';
import { getDefaultExport } from '../../utils/get-default-export';

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
 *
 * @deprecated Express is now instrumented automatically via `expressIntegration()`. This export is
 * no longer used and will be removed in the next major version.
 */
export function patchExpressModule(
  moduleExports: ExpressModuleExport,
  getOptions: () => ExpressIntegrationOptions,
): ExpressModuleExport {
  if (typeof getOptions !== 'function') {
    throw new TypeError('`patchExpressModule(moduleExports, getOptions)` requires a `getOptions` callback');
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

// The deprecated `expressErrorHandler` / `setupExpressErrorHandler` now live in `@sentry/server-utils`
// (alongside the channel-based `expressIntegration()`), so they are not defined here anymore.
