/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-koa
 * - Upstream version: @opentelemetry/instrumentation-koa@0.66.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 * - Span creation migrated to the @sentry/core API; op/origin/name and transaction name folded into
 *   span creation (previously set via a Sentry requestHook)
 */

import * as api from '@opentelemetry/api';
import { isWrapped, InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';

import { KoaLayerType, type KoaInstrumentationConfig } from './types';
import {
  debug,
  getDefaultIsolationScope,
  getIsolationScope,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
} from '@sentry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { getMiddlewareMetadata, isLayerIgnored } from './utils';
import { setHttpServerSpanRouteAttribute } from '../../../../utils/setHttpServerSpanRouteAttribute';
import { DEBUG_BUILD } from '../../../../debug-build';
import { AttributeNames } from './enums/AttributeNames';
import {
  kLayerPatched,
  type Next,
  type KoaContext,
  type KoaMiddleware,
  type KoaPatchedMiddleware,
} from './internal-types';

const PACKAGE_NAME = '@sentry/instrumentation-koa';

interface KoaModuleExports {
  prototype: { use: KoaMiddleware };
}

type KoaModule = KoaModuleExports & { [Symbol.toStringTag]?: string; default?: KoaModuleExports };

/** Koa instrumentation for OpenTelemetry */
export class KoaInstrumentation extends InstrumentationBase<KoaInstrumentationConfig> {
  constructor(config: KoaInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  protected init() {
    return new InstrumentationNodeModuleDefinition(
      'koa',
      ['>=2.0.0 <4'],
      (module: KoaModule) => {
        const moduleExports =
          module[Symbol.toStringTag] === 'Module'
            ? module.default // ESM
            : module; // CommonJS
        if (moduleExports == null) {
          return moduleExports;
        }
        if (isWrapped(moduleExports.prototype.use)) {
          this._unwrap(moduleExports.prototype, 'use');
        }
        this._wrap(moduleExports.prototype, 'use', this._getKoaUsePatch.bind(this));
        return module;
      },
      (module: KoaModule) => {
        const moduleExports =
          module[Symbol.toStringTag] === 'Module'
            ? module.default // ESM
            : module; // CommonJS
        if (moduleExports && isWrapped(moduleExports.prototype.use)) {
          this._unwrap(moduleExports.prototype, 'use');
        }
      },
    );
  }

  /**
   * Patches the Koa.use function in order to instrument each original
   * middleware layer which is introduced
   * @param {KoaMiddleware} middleware - the original middleware function
   */
  private _getKoaUsePatch(original: (middleware: KoaMiddleware) => unknown) {
    const patchRouterDispatch = this._patchRouterDispatch.bind(this);
    const patchLayer = this._patchLayer.bind(this);
    return function use(this: unknown, middlewareFunction: KoaMiddleware) {
      const patchedFunction = middlewareFunction.router
        ? patchRouterDispatch(middlewareFunction)
        : patchLayer(middlewareFunction, false);
      return original.apply(this, [patchedFunction]);
    };
  }

  /**
   * Patches the dispatch function used by @koa/router. This function
   * goes through each routed middleware and adds instrumentation via a call
   * to the @function _patchLayer function.
   * @param {KoaMiddleware} dispatchLayer - the original dispatch function which dispatches
   * routed middleware
   */
  private _patchRouterDispatch(dispatchLayer: KoaMiddleware): KoaMiddleware {
    const router = dispatchLayer.router;

    const routesStack = router?.stack ?? [];
    for (const pathLayer of routesStack) {
      const path = pathLayer.path;
      const pathStack = pathLayer.stack;
      for (let j = 0; j < pathStack.length; j++) {
        const routedMiddleware: KoaMiddleware = pathStack[j]!;
        pathStack[j] = this._patchLayer(routedMiddleware, true, path);
      }
    }

    return dispatchLayer;
  }

  /**
   * Patches each individual @param middlewareLayer function in order to create the
   * span and propagate context. It does not create spans when there is no parent span.
   * @param {KoaMiddleware} middlewareLayer - the original middleware function.
   * @param {boolean} isRouter - tracks whether the original middleware function
   * was dispatched by the router originally
   * @param {string?} layerPath - if present, provides additional data from the
   * router about the routed path which the middleware is attached to
   */
  private _patchLayer(
    middlewareLayer: KoaPatchedMiddleware,
    isRouter: boolean,
    layerPath?: string | RegExp,
  ): KoaMiddleware {
    const layerType = isRouter ? KoaLayerType.ROUTER : KoaLayerType.MIDDLEWARE;
    // Skip patching layer if its ignored in the config
    if (middlewareLayer[kLayerPatched] === true || isLayerIgnored(layerType, this.getConfig())) return middlewareLayer;

    if (
      middlewareLayer.constructor.name === 'GeneratorFunction' ||
      middlewareLayer.constructor.name === 'AsyncGeneratorFunction'
    ) {
      return middlewareLayer;
    }

    middlewareLayer[kLayerPatched] = true;

    return (context: KoaContext, next: Next) => {
      const parent = api.trace.getSpan(api.context.active());
      if (parent === undefined) {
        return middlewareLayer(context, next);
      }
      const metadata = getMiddlewareMetadata(context, middlewareLayer, isRouter, layerPath);

      if (context._matchedRoute) {
        setHttpServerSpanRouteAttribute(context._matchedRoute.toString());
      }

      const koaName = metadata.attributes[AttributeNames.KOA_NAME];
      // Somehow, name is sometimes `''` for middleware spans
      // See: https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2220
      const name = typeof koaName === 'string' ? koaName || '< unknown >' : metadata.name;

      return startSpan(
        {
          name,
          op: `${layerType}.koa`,
          attributes: {
            ...metadata.attributes,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.koa',
          },
        },
        () => {
          const route = metadata.attributes[ATTR_HTTP_ROUTE];
          if (getIsolationScope() === getDefaultIsolationScope()) {
            DEBUG_BUILD && debug.warn('Isolation scope is default isolation scope - skipping setting transactionName');
          } else if (route) {
            const method = (context.request as { method?: string } | undefined)?.method?.toUpperCase() || 'GET';
            getIsolationScope().setTransactionName(`${method} ${route}`);
          }
          return middlewareLayer(context, next);
        },
      );
    };
  }
}
