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
/* eslint-disable */

import { context, Span, SpanOptions } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import type { HandleFunction, NextFunction, Server } from 'connect';
import type { ServerResponse } from 'http';
import {
  AttributeNames,
  ConnectNames,
  ConnectTypes,
} from './enums/AttributeNames';
import { PatchedRequest, Use, UseArgs, UseArgs2 } from './internal-types';
import { SDK_VERSION } from '@sentry/core';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  replaceCurrentStackRoute,
  addNewStackLayer,
  generateRoute,
} from './utils';

const PACKAGE_NAME = '@sentry/instrumentation-connect';

export const ANONYMOUS_NAME = 'anonymous';

/** Connect instrumentation for OpenTelemetry */
export class ConnectInstrumentation extends InstrumentationBase {
  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'connect',
        ['>=3.0.0 <4'],
        moduleExports => {
          return this._patchConstructor(moduleExports);
        }
      ),
    ];
  }

  private _patchApp(patchedApp: Server) {
    if (!isWrapped(patchedApp.use)) {
      this._wrap(patchedApp, 'use', this._patchUse.bind(this));
    }
    if (!isWrapped(patchedApp.handle)) {
      this._wrap(patchedApp, 'handle', this._patchHandle.bind(this));
    }
  }

  private _patchConstructor(original: () => Server): () => Server {
    const instrumentation = this;
    return function (this: Server, ...args: any[]) {
      const app = original.apply(this, args) as Server;
      instrumentation._patchApp(app);
      return app;
    };
  }

  public _patchNext(next: NextFunction, finishSpan: () => void): NextFunction {
    return function nextFunction(this: NextFunction, err?: any): void {
      const result = next.apply(this, [err]);
      finishSpan();
      return result;
    };
  }

  public _startSpan(routeName: string, middleWare: HandleFunction): Span {
    let connectType: ConnectTypes;
    let connectName: string;
    let connectTypeName: string;
    if (routeName) {
      connectType = ConnectTypes.REQUEST_HANDLER;
      connectTypeName = ConnectNames.REQUEST_HANDLER;
      connectName = routeName;
    } else {
      connectType = ConnectTypes.MIDDLEWARE;
      connectTypeName = ConnectNames.MIDDLEWARE;
      connectName = middleWare.name || ANONYMOUS_NAME;
    }
    const spanName = `${connectTypeName} - ${connectName}`;
    const options: SpanOptions = {
      attributes: {
        [ATTR_HTTP_ROUTE]: routeName.length > 0 ? routeName : '/',
        [AttributeNames.CONNECT_TYPE]: connectType,
        [AttributeNames.CONNECT_NAME]: connectName,
      },
    };

    return this.tracer.startSpan(spanName, options);
  }

  public _patchMiddleware(
    routeName: string,
    middleWare: HandleFunction
  ): HandleFunction {
    const instrumentation = this;
    const isErrorMiddleware = middleWare.length === 4;

    function patchedMiddleware(this: Use): void {
      if (!instrumentation.isEnabled()) {
        return (middleWare as any).apply(this, arguments);
      }
      const [reqArgIdx, resArgIdx, nextArgIdx] = isErrorMiddleware
        ? [1, 2, 3]
        : [0, 1, 2];
      const req = arguments[reqArgIdx] as PatchedRequest;
      const res = arguments[resArgIdx] as ServerResponse;
      const next = arguments[nextArgIdx] as NextFunction;

      replaceCurrentStackRoute(req, routeName);

      const rpcMetadata = getRPCMetadata(context.active());
      if (routeName && rpcMetadata?.type === RPCType.HTTP) {
        rpcMetadata.route = generateRoute(req);
      }

      let spanName = '';
      if (routeName) {
        spanName = `request handler - ${routeName}`;
      } else {
        spanName = `middleware - ${middleWare.name || ANONYMOUS_NAME}`;
      }
      const span = instrumentation._startSpan(routeName, middleWare);
      instrumentation._diag.debug('start span', spanName);
      let spanFinished = false;

      function finishSpan() {
        if (!spanFinished) {
          spanFinished = true;
          instrumentation._diag.debug(`finishing span ${(span as any).name}`);
          span.end();
        } else {
          instrumentation._diag.debug(
            `span ${(span as any).name} - already finished`
          );
        }
        res.removeListener('close', finishSpan);
      }

      res.addListener('close', finishSpan);
      arguments[nextArgIdx] = instrumentation._patchNext(next, finishSpan);

      return (middleWare as any).apply(this, arguments);
    }

    Object.defineProperty(patchedMiddleware, 'length', {
      value: middleWare.length,
      writable: false,
      configurable: true,
    });

    return patchedMiddleware;
  }

  public _patchUse(original: Server['use']): Use {
    const instrumentation = this;
    return function (this: Server, ...args: UseArgs): Server {
      const middleWare = args[args.length - 1] as HandleFunction;
      const routeName = (args[args.length - 2] || '') as string;

      args[args.length - 1] = instrumentation._patchMiddleware(
        routeName,
        middleWare
      );

      return original.apply(this, args as UseArgs2);
    };
  }

  public _patchHandle(original: Server['handle']): Server['handle'] {
    const instrumentation = this;
    return function (this: Server): ReturnType<Server['handle']> {
      const [reqIdx, outIdx] = [0, 2];
      const req = arguments[reqIdx] as PatchedRequest;
      const out = arguments[outIdx];
      const completeStack = addNewStackLayer(req);

      if (typeof out === 'function') {
        arguments[outIdx] = instrumentation._patchOut(
          out as NextFunction,
          completeStack
        );
      }

      return (original as any).apply(this, arguments);
    };
  }

  public _patchOut(out: NextFunction, completeStack: () => void): NextFunction {
    return function nextFunction(this: NextFunction, ...args: any[]): void {
      completeStack();
      return Reflect.apply(out, this, args);
    };
  }
}
