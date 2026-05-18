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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-koa
 * - Upstream version: @opentelemetry/instrumentation-koa@0.66.0
 */
/* eslint-disable */

// Inlined from @types/koa (DefinitelyTyped)
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/koa/index.d.ts
interface DefaultState {}

export type Next = () => Promise<any>;

// Inlined from @types/koa-compose (DefinitelyTyped)
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/koa-compose/index.d.ts
type Middleware<T> = (context: T, next: Next) => any;

// Inlined from @types/koa. Simplified to only include fields accessed by this instrumentation
type ParameterizedContext<_StateT = DefaultState, ContextT = {}, _ResponseBodyT = unknown> = {
  [key: string]: any;
} & ContextT;

// Inlined from @types/koa__router (DefinitelyTyped)
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/koa__router/index.d.ts
interface RouterParamContext {
  params: Record<string, string>;
  router: Router;
  _matchedRoute: string | RegExp | undefined;
  _matchedRouteName: string | undefined;
}

interface Layer {
  path: string | RegExp;
  stack: any[];
}

export interface Router {
  stack: Layer[];
}

export type KoaContext = ParameterizedContext<DefaultState, RouterParamContext>;
export type KoaMiddleware = Middleware<KoaContext> & {
  router?: Router;
};

/**
 * This symbol is used to mark a Koa layer as being already instrumented
 * since its possible to use a given layer multiple times (ex: middlewares)
 */
export const kLayerPatched: unique symbol = Symbol('koa-layer-patched');

export type KoaPatchedMiddleware = KoaMiddleware & {
  [kLayerPatched]?: boolean;
};
