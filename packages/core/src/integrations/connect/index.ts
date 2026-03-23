/**
 * Platform-portable Connect tracing integration.
 *
 * @module
 *
 * This Sentry integration is a derivative work based on the OpenTelemetry
 * Connect instrumentation.
 *
 * <https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-connect>
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

import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { startSpanManual, withActiveSpan } from '../../tracing';
import { getActiveSpan } from '../../utils/spanUtils';
import { wrapMethod } from '../../utils/object';
import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/debug-logger';
import { getDefaultExport } from '../../utils/get-default-export';

export const ANONYMOUS_NAME = 'anonymous';

// Symbol used to store the route stack on the request object (non-enumerable)
const _LAYERS_STORE_PROPERTY = Symbol('sentry.connect.request-route-stack');

// --- Type definitions ---

export type ConnectRequest = {
  method?: string;
  url?: string;
  [key: symbol]: unknown;
};

export type ConnectResponse = {
  addListener(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
};

export type ConnectMiddleware = ((...args: unknown[]) => unknown) & {
  name?: string;
  length: number;
};

export type ConnectApp = {
  use: (...args: unknown[]) => ConnectApp;
  handle: (...args: unknown[]) => unknown;
};

// The connect module export is a factory function: connect() returns a ConnectApp
export type ConnectModule = (...args: unknown[]) => ConnectApp;

export type ConnectModuleExport =
  | ConnectModule
  | {
      default: ConnectModule;
    };

export interface ConnectIntegrationOptions {
  /**
   * Optional callback invoked each time a named route handler resolves the
   * matched HTTP route. Platform-specific integrations (e.g. Node.js) can use
   * this to propagate the resolved route to OTel RPCMetadata.
   */
  onRouteResolved?: (route: string) => void;
}

// --- Internal route stack management ---
// Tracks nested route paths on the request object, mirroring the OTel
// connect instrumentation's approach for building the full HTTP route.

function addNewStackLayer(req: ConnectRequest): () => void {
  let layers = req[_LAYERS_STORE_PROPERTY] as string[] | undefined;
  if (!Array.isArray(layers)) {
    layers = [];
    Object.defineProperty(req, _LAYERS_STORE_PROPERTY, {
      enumerable: false,
      value: layers,
    });
  }
  layers.push('/');
  const stackLength = layers.length;
  return () => {
    if (
      Array.isArray(req[_LAYERS_STORE_PROPERTY]) &&
      (req[_LAYERS_STORE_PROPERTY] as string[]).length === stackLength
    ) {
      (req[_LAYERS_STORE_PROPERTY] as string[]).pop();
    }
  };
}

function replaceCurrentStackRoute(req: ConnectRequest, newRoute: string): void {
  if (!newRoute) return;
  const layers = req[_LAYERS_STORE_PROPERTY] as string[] | undefined;
  if (Array.isArray(layers) && layers.length > 0) {
    layers.splice(-1, 1, newRoute);
  }
}

// Combines all stack layers into a single route path, deduplicating slashes:
// ['/api/', '/users', '/:id'] => '/api/users/:id'
function generateRoute(req: ConnectRequest): string {
  const layers = req[_LAYERS_STORE_PROPERTY] as string[] | undefined;
  /* v8 ignore start */
  if (!Array.isArray(layers) || layers.length === 0) return '/';
  return layers.reduce((acc: string, sub: string) => acc.replace(/\/+$/, '') + sub);
}

// --- Middleware patching ---

function patchMiddleware(
  routeName: string,
  middleware: ConnectMiddleware,
  options?: ConnectIntegrationOptions,
): ConnectMiddleware {
  // Error middlewares have 4 arguments: (err, req, res, next)
  const isErrorMiddleware = middleware.length === 4;

  function patchedMiddleware(this: unknown, ...args: unknown[]): unknown {
    const parentSpan = getActiveSpan();
    if (!parentSpan) {
      return middleware.apply(this, args);
    }

    const [reqArgIdx, resArgIdx, nextArgIdx] = isErrorMiddleware ? [1, 2, 3] : [0, 1, 2];
    const req = args[reqArgIdx] as ConnectRequest;
    const res = args[resArgIdx] as ConnectResponse;
    const next = args[nextArgIdx] as ((...a: unknown[]) => unknown) | undefined;

    replaceCurrentStackRoute(req, routeName);

    const isRequestHandler = !!routeName;
    const connectType = isRequestHandler ? 'request_handler' : 'middleware';
    const connectName = isRequestHandler ? routeName : middleware.name || ANONYMOUS_NAME;

    if (isRequestHandler) {
      options?.onRouteResolved?.(generateRoute(req));
    }

    return startSpanManual(
      {
        name: connectName,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${connectType}.connect`,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.connect',
          'http.route': routeName.length > 0 ? routeName : '/',
          'connect.type': connectType,
          'connect.name': connectName,
        },
      },
      span => {
        let spanFinished = false;

        function finishSpan(): void {
          if (!spanFinished) {
            spanFinished = true;
            span.end();
          }
          res.removeListener('close', finishSpan);
        }

        // End the span when the response closes (handles async middlewares that
        // do not call next())
        res.addListener('close', finishSpan);

        if (typeof next === 'function') {
          // End this span and restore the parent span context before calling
          // next(), so that subsequent middleware spans are siblings (children
          // of the parent) rather than nested under this span.
          args[nextArgIdx] = function patchedNext(this: unknown, ...nextArgs: unknown[]) {
            finishSpan();
            return withActiveSpan(parentSpan, () => next.apply(this, nextArgs));
          };
        }

        return middleware.apply(this, args);
      },
    );
  }

  // Preserve the original function's arity so connect can detect error
  // middlewares (length === 4) correctly.
  Object.defineProperty(patchedMiddleware, 'length', {
    value: middleware.length,
    writable: false,
    configurable: true,
  });

  return patchedMiddleware;
}

// --- App patching ---

/**
 * Patch an already-created connect app instance.
 */
export function patchConnectApp(app: ConnectApp, options?: ConnectIntegrationOptions): void {
  const originalUse = app.use;
  try {
    wrapMethod(app, 'use', function patchedUse(this: ConnectApp, ...args: unknown[]) {
      // connect.use([route,] middleware) — the route is optional
      const middleware = args[args.length - 1] as ConnectMiddleware;
      /* v8 ignore start */
      const routeName = args.length > 1 ? String(args[args.length - 2] ?? '') : '';
      args[args.length - 1] = patchMiddleware(routeName, middleware, options);
      return originalUse.apply(this, args);
    });
  } catch (e) {
    DEBUG_BUILD && debug.error('Failed to patch connect use method:', e);
  }

  const originalHandle = app.handle;
  try {
    wrapMethod(app, 'handle', function patchedHandle(this: unknown, ...args: unknown[]) {
      // handle(req, res[, out]) — 'out' is the fallback called when no
      // middleware matches the request (used for nested apps).
      const req = args[0] as ConnectRequest;
      const out = args[2];
      const completeStack = addNewStackLayer(req);
      if (typeof out === 'function') {
        args[2] = function patchedOut(this: unknown, ...outArgs: unknown[]) {
          completeStack();
          return (out as (...a: unknown[]) => unknown).apply(this, outArgs);
        };
      }
      return originalHandle.apply(this, args);
    });
  } catch (e) {
    DEBUG_BUILD && debug.error('Failed to patch connect handle method:', e);
  }
}

/**
 * Wrap the connect factory function so that every app created with it is
 * automatically patched.
 *
 * @example
 * ```javascript
 * import connect from 'connect';
 * import * as Sentry from '@sentry/node'; // or any SDK that extends core
 *
 * const patchedConnect = Sentry.patchConnectModule(connect);
 * const app = patchedConnect();
 * ```
 */
export function patchConnectModule(
  connectModule: ConnectModuleExport,
  options?: ConnectIntegrationOptions,
): ConnectModule {
  const connect = getDefaultExport(connectModule);
  return function patchedConnect(this: unknown, ...args: unknown[]) {
    const app = connect.apply(this, args) as ConnectApp;
    patchConnectApp(app, options);
    return app;
  } as ConnectModule;
}

// --- Error handler ---

function connectErrorMiddleware(err: unknown, _req: unknown, _res: unknown, next: (err: unknown) => void): void {
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
 * const connect = require('connect');
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
export function setupConnectErrorHandler(app: { use: (middleware: unknown) => void }): void {
  app.use(connectErrorMiddleware);
}
