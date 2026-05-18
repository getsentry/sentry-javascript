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

import type { Middleware, ParameterizedContext, DefaultState } from 'koa';
import type * as Router from '@koa/router';

/**
 * Type compatibility note:
 *
 * This package uses @types/koa@3.x, but @types/koa__router@12.x depends on
 * @types/koa@2.x. This creates type conflicts when working with router middleware.
 * At runtime, koa@3.x is used throughout, so all methods exist and work correctly.
 *
 * The type casts in instrumentation.ts are necessary to bridge this gap.
 *
 * TODO: Remove type casts when @types/koa__router@13+ with @types/koa@3.x support is available
 */

export type KoaContext = ParameterizedContext<DefaultState, Router.RouterParamContext>;
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
