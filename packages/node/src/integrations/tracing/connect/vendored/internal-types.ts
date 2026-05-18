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
 */
/* eslint-disable */

import type { HandleFunction, IncomingMessage, Server } from 'connect';

export const _LAYERS_STORE_PROPERTY: unique symbol = Symbol(
  'opentelemetry.instrumentation-connect.request-route-stack',
);

export type UseArgs1 = [HandleFunction];
export type UseArgs2 = [string, HandleFunction];
export type UseArgs = UseArgs1 | UseArgs2;
export type Use = (...args: UseArgs) => Server;
export type PatchedRequest = {
  [_LAYERS_STORE_PROPERTY]: string[];
} & IncomingMessage;
