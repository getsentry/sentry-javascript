/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */

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

import type { Request } from 'express';

/**
 * This symbol is used to mark express layer as being already instrumented
 * since its possible to use a given layer multiple times (ex: middlewares)
 */
export const kLayerPatched: unique symbol = Symbol('express-layer-patched');

/**
 * This const define where on the `request` object the Instrumentation will mount the
 * current stack of express layer.
 *
 * It is necessary because express doesn't store the different layers
 * (ie: middleware, router etc) that it called to get to the current layer.
 * Given that, the only way to know the route of a given layer is to
 * store the path of where each previous layer has been mounted.
 *
 * ex: bodyParser > auth middleware > /users router > get /:id
 *  in this case the stack would be: ["/users", "/:id"]
 *
 * ex2: bodyParser > /api router > /v1 router > /users router > get /:id
 *  stack: ["/api", "/v1", "/users", ":id"]
 *
 */
export const _LAYERS_STORE_PROPERTY = '__ot_middlewares';

export type PatchedRequest = {
  [_LAYERS_STORE_PROPERTY]?: string[];
} & Request;
export type PathParams = string | RegExp | Array<string | RegExp>;

// https://github.com/expressjs/express/blob/main/lib/router/index.js#L53
export type ExpressRouter = {
  stack: ExpressLayer[];
};

// https://github.com/expressjs/express/blob/main/lib/router/layer.js#L33
export type ExpressLayer = {
  handle: Function & Record<string, any>;
  [kLayerPatched]?: boolean;
  name: string;
  path: string;
  route?: ExpressLayer;
};
