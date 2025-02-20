/* eslint-disable @typescript-eslint/no-explicit-any */

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
 */

import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { ExpressLayerType } from './enums/ExpressLayerType';

export type LayerPathSegment = string | RegExp | number;

export type IgnoreMatcher = string | RegExp | ((name: string) => boolean);

export type ExpressRequestInfo<T = any> = {
  /** An express request object */
  request: T;
  route: string;
  layerType: ExpressLayerType;
};

export type SpanNameHook = (
  info: ExpressRequestInfo,
  /**
   * If no decision is taken based on RequestInfo, the default name
   * supplied by the instrumentation can be used instead.
   */
  defaultName: string,
) => string;

/**
 * Function that can be used to add custom attributes to the current span or the root span on
 * a Express request
 * @param span - The Express middleware layer span.
 * @param info - An instance of ExpressRequestInfo that contains info about the request such as the route, and the layer type.
 */
export interface ExpressRequestCustomAttributeFunction {
  (span: Span, info: ExpressRequestInfo): void;
}

/**
 * Options available for the Express Instrumentation (see [documentation](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-express#express-instrumentation-options))
 */
export interface ExpressInstrumentationConfig extends InstrumentationConfig {
  /** Ignore specific based on their name */
  ignoreLayers?: IgnoreMatcher[];
  /** Ignore specific layers based on their type */
  ignoreLayersType?: ExpressLayerType[];
  spanNameHook?: SpanNameHook;

  /** Function for adding custom attributes on Express request */
  requestHook?: ExpressRequestCustomAttributeFunction;
}
