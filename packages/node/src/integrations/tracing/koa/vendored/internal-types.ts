/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-koa
 * - Upstream version: @opentelemetry/instrumentation-koa@0.66.0
 * - Some types vendored from @types/koa, @types/koa-compose, and @types/koa__router with simplifications
 */

interface DefaultState {}

export type Next = () => Promise<unknown>;

type ParameterizedContext<_StateT = DefaultState, ContextT = {}, _ResponseBodyT = unknown> = {
  [key: string]: unknown;
} & ContextT;

type Middleware<StateT = DefaultState, ContextT = {}, ResponseBodyT = unknown> = (
  context: ParameterizedContext<StateT, ContextT, ResponseBodyT>,
  next: Next,
) => unknown;

interface RouterParamContext<StateT = DefaultState, ContextT = {}> {
  params: Record<string, string>;
  router: Router<StateT, ContextT>;
  _matchedRoute: string | RegExp | undefined;
  _matchedRouteName: string | undefined;
}

interface Layer {
  path: string | RegExp;
  stack: KoaMiddleware[];
}

export interface Router<_StateT = DefaultState, _ContextT = {}> {
  stack: Layer[];
}

export type KoaContext = ParameterizedContext<DefaultState, RouterParamContext>;
export type KoaMiddleware = Middleware<DefaultState, KoaContext> & {
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
