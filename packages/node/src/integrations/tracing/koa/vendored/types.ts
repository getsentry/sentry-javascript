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

import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export enum KoaLayerType {
  ROUTER = 'router',
  MIDDLEWARE = 'middleware',
}

/**
 * Information about the current Koa middleware layer
 * The middleware layer type is any by default.
 * One can install koa types packages `@types/koa` and `@types/koa__router`
 * with compatible versions to the koa version used in the project
 * to get more specific types for the middleware layer property.
 *
 * Example use in a custom attribute function:
 * ```ts
 * import type { Middleware, ParameterizedContext, DefaultState } from 'koa';
 * import type { RouterParamContext } from '@koa/router';
 *
 * type KoaContext = ParameterizedContext<DefaultState, RouterParamContext>;
 * type KoaMiddleware = Middleware<DefaultState, KoaContext>;
 *
 * const koaConfig: KoaInstrumentationConfig<KoaContext, KoaMiddleware> = {
 *  requestHook: (span: Span, info: KoaRequestInfo<KoaContext, KoaMiddleware>) => {
 *   // custom typescript code that can access the typed into.middlewareLayer and info.context
 * }
 *
 */
export type KoaRequestInfo<KoaContextType = any, KoaMiddlewareType = any> = {
  context: KoaContextType;
  middlewareLayer: KoaMiddlewareType;
  layerType: KoaLayerType;
};

/**
 * Function that can be used to add custom attributes to the current span
 * @param span - The Express middleware layer span.
 * @param context - The current KoaContext.
 */
export interface KoaRequestCustomAttributeFunction<
  KoaContextType = any,
  KoaMiddlewareType = any,
> {
  (span: Span, info: KoaRequestInfo<KoaContextType, KoaMiddlewareType>): void;
}

/**
 * Options available for the Koa Instrumentation (see [documentation](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-Instrumentation-koa#koa-Instrumentation-options))
 */
export interface KoaInstrumentationConfig<
  KoaContextType = any,
  KoaMiddlewareType = any,
> extends InstrumentationConfig {
  /** Ignore specific layers based on their type */
  ignoreLayersType?: KoaLayerType[];
  /** Function for adding custom attributes to each middleware layer span */
  requestHook?: KoaRequestCustomAttributeFunction<
    KoaContextType,
    KoaMiddlewareType
  >;
}
