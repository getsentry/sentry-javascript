/*
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
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-connect
 * - Upstream version: @opentelemetry/instrumentation-connect@0.61.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */

import type { ServerResponse } from 'http';
import { AttributeNames, ConnectTypes } from './enums/AttributeNames';
import type { HandleFunction, NextFunction, PatchedRequest, Server, Use, UseArgs, UseArgs2 } from './internal-types';
import type { Span } from '@sentry/core';
import {
  isError,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
} from '@sentry/core';
import { setHttpServerSpanRouteAttribute } from '../../../../utils/setHttpServerSpanRouteAttribute';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { replaceCurrentStackRoute, addNewStackLayer, generateRoute } from './utils';

const PACKAGE_NAME = '@sentry/instrumentation-connect';

const ANONYMOUS_NAME = 'anonymous';

/** Connect instrumentation for OpenTelemetry */
export class ConnectInstrumentation extends InstrumentationBase {
  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition('connect', ['>=3.0.0 <4'], moduleExports => {
        return this._patchConstructor(moduleExports);
      }),
    ];
  }

  private _patchApp(patchedApp: Server) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    if (!isWrapped(patchedApp.use)) {
      this._wrap(patchedApp, 'use', this._patchUse.bind(this));
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    if (!isWrapped(patchedApp.handle)) {
      this._wrap(patchedApp, 'handle', this._patchHandle.bind(this));
    }
  }

  private _patchConstructor(original: () => Server): () => Server {
    const patchApp = this._patchApp.bind(this);
    return function (this: Server, ...args: unknown[]) {
      const app = Reflect.apply(original, this, args) as Server;
      patchApp(app);
      return app;
    };
  }

  public _patchNext(next: NextFunction, span: Span, finishSpan: () => void): NextFunction {
    return function nextFunction(this: NextFunction, err?: unknown): void {
      if (isError(err)) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      }
      const result = next.apply(this, [err]);
      finishSpan();
      return result;
    };
  }

  public _startSpan(routeName: string, middleWare: HandleFunction): Span {
    const connectType = routeName ? ConnectTypes.REQUEST_HANDLER : ConnectTypes.MIDDLEWARE;
    const connectName = routeName || middleWare.name || ANONYMOUS_NAME;
    return startInactiveSpan({
      name: connectName,
      op: `${connectType}.connect`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.connect',
        [ATTR_HTTP_ROUTE]: routeName.length > 0 ? routeName : '/',
        [AttributeNames.CONNECT_TYPE]: connectType,
        [AttributeNames.CONNECT_NAME]: connectName,
      },
    });
  }

  public _patchMiddleware(routeName: string, middleWare: HandleFunction): HandleFunction {
    const isEnabled = this.isEnabled.bind(this);
    const startSpan: (routeName: string, middleWare: HandleFunction) => Span = this._startSpan.bind(this);
    const patchNext = this._patchNext.bind(this);
    const isErrorMiddleware = middleWare.length === 4;

    function patchedMiddleware(this: Use): void {
      if (!isEnabled()) {
        return Reflect.apply(middleWare, this, arguments);
      }
      const [reqArgIdx, resArgIdx, nextArgIdx] = isErrorMiddleware ? [1, 2, 3] : [0, 1, 2];
      const req = arguments[reqArgIdx] as PatchedRequest;
      const res = arguments[resArgIdx] as ServerResponse;
      const next = arguments[nextArgIdx] as NextFunction;

      replaceCurrentStackRoute(req, routeName);

      if (routeName) {
        setHttpServerSpanRouteAttribute(generateRoute(req));
      }

      const span = startSpan(routeName, middleWare);
      let spanFinished = false;

      function finishSpan() {
        if (!spanFinished) {
          spanFinished = true;
          span.end();
        }
        res.removeListener('close', finishSpan);
      }

      res.addListener('close', finishSpan);
      arguments[nextArgIdx] = patchNext(next, span, finishSpan);

      try {
        return Reflect.apply(middleWare, this, arguments);
      } catch (e) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        finishSpan();
        throw e;
      }
    }

    Object.defineProperty(patchedMiddleware, 'length', {
      value: middleWare.length,
      writable: false,
      configurable: true,
    });

    return patchedMiddleware;
  }

  public _patchUse(original: Server['use']): Use {
    const patchMiddleware = this._patchMiddleware.bind(this);
    return function (this: Server, ...args: UseArgs): Server {
      const middleWare = args[args.length - 1] as HandleFunction;
      const routeName = (args[args.length - 2] || '') as string;

      args[args.length - 1] = patchMiddleware(routeName, middleWare);

      return original.apply(this, args as UseArgs2);
    };
  }

  public _patchHandle(original: Server['handle']): Server['handle'] {
    const patchOut = this._patchOut.bind(this);
    return function (this: Server): ReturnType<Server['handle']> {
      const [reqIdx, outIdx] = [0, 2];
      const req = arguments[reqIdx] as PatchedRequest;
      const out = arguments[outIdx];
      const completeStack = addNewStackLayer(req);

      if (typeof out === 'function') {
        arguments[outIdx] = patchOut(out as NextFunction, completeStack);
      }

      return Reflect.apply(original, this, arguments);
    };
  }

  public _patchOut(out: NextFunction, completeStack: () => void): NextFunction {
    return function nextFunction(this: NextFunction, ...args: unknown[]): void {
      completeStack();
      return Reflect.apply(out, this, args);
    };
  }
}
