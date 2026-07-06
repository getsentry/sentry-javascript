/**
 * Platform-portable HTTP(S) outgoing-request patching integration
 *
 * Patches the `http` and `https` Node.js built-in module exports to create
 * Sentry spans for outgoing requests and optionally inject distributed trace
 * propagation headers.
 *
 * @module
 *
 * This Sentry integration is a derivative work based on the OpenTelemetry
 * HTTP instrumentation.
 *
 * <https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation-http>
 *
 * Extended under the terms of the Apache 2.0 license linked below:
 *
 * ----
 *
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

import { getDefaultExport } from '../../utils/get-default-export';
import { HTTP_ON_CLIENT_REQUEST } from './constants';
import type { HttpExport, HttpModuleExport, HttpInstrumentationOptions, HttpClientRequest } from './types';
import { getOriginalFunction, wrapMethod } from '../../utils/object';
import { getHttpClientSubscriptions } from './client-subscriptions';

function patchHttpRequest(httpModule: HttpExport, options: HttpInstrumentationOptions): void {
  // avoid double-wrap
  if (!getOriginalFunction(httpModule.request)) {
    const { [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated } = getHttpClientSubscriptions({
      ...options,
      http: httpModule,
    });

    const originalRequest = httpModule.request;
    wrapMethod(httpModule, 'request', function patchedRequest(this: HttpExport, ...args: unknown[]) {
      const request = originalRequest.apply(this, args) as HttpClientRequest;
      onHttpClientRequestCreated({ request }, HTTP_ON_CLIENT_REQUEST);
      return request;
    });
  }
}

// This simply ensures that http.get calls http.request, which we patched.
// Call it from the object each time, to ensure that any subsequent patches
// or other mutations are also respected.
function patchHttpGet(httpModule: HttpExport) {
  if (!getOriginalFunction(httpModule.get)) {
    // match node's normalization to exactly 3 arguments.
    wrapMethod(httpModule, 'get', function patchedGet(this: HttpExport, input: unknown, options: unknown, cb: unknown) {
      // http.get is like http.request but automatically calls .end()
      const request = httpModule.request.call(this, input, options, cb) as HttpClientRequest;
      request.end();
      return request;
    });
  }
}

function patchModule(httpModuleExport: HttpModuleExport, options: HttpInstrumentationOptions = {}): HttpModuleExport {
  const httpDefault = getDefaultExport(httpModuleExport);
  const httpModule = httpModuleExport as HttpExport;
  // if we have a default, patch that, and copy to the import container
  if (httpDefault !== httpModuleExport) {
    patchModule(httpDefault, options);
    // Mirror the patched methods onto the outer container so that consumers
    // reading them off `httpModuleExport` (rather than its default export) see
    // the wrapped versions too. Copy with defineProperty because these might be
    // configured oddly. Real ES module namespace objects (e.g. `import * as
    // http`) expose non-configurable, read-only exports that can neither be
    // redefined nor assigned, so skip those — patching the default export is
    // enough for `require()`/default-import consumers, which is the common case.
    for (const method of ['get', 'request']) {
      const desc = Object.getOwnPropertyDescriptor(httpDefault, method);
      // Only redefine if the *target* property is missing or configurable.
      // e.g. if `httpModule` is an ESM module namespace object, like `import * as http`,
      // its exports are non-configurable and read-only, so we skip this —
      // you cannot redefine or assign non-configurable properties.
      const existing = Object.getOwnPropertyDescriptor(httpModule, method);
      if (desc && (!existing || existing.configurable)) {
        Object.defineProperty(httpModule, method, desc);
      }
    }
    return httpModule;
  }
  patchHttpRequest(httpModule, options);
  patchHttpGet(httpModule);
  return httpModuleExport;
}

/**
 * Patch an `node:http` or `node:https` module-shaped export so that every
 * outgoing request is tracked by Sentry.
 *
 * @example
 * ```javascript
 * import http from 'http';
 * import { patchHttpModule } from '@sentry/core';
 * patchHttpModule(http, { propagateTrace: true });
 * ```
 */
export const patchHttpModuleClient = (
  httpModuleExport: HttpModuleExport,
  options: HttpInstrumentationOptions = {},
): HttpModuleExport => patchModule(httpModuleExport, options);
