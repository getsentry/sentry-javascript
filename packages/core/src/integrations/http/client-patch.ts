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
import type {
  HttpExport,
  HttpModuleExport,
  HttpInstrumentationOptions,
  HttpClientRequest,
} from './types';
import { getOriginalFunction, wrapMethod } from '../../utils/object';
import type { WrappedFunction } from '../../types-hoist/wrappedfunction';
import { getHttpClientSubscriptions } from './client-subscriptions';

function patchHttpRequest(
  httpModule: HttpExport,
  options: HttpInstrumentationOptions,
  protocol: 'http:' | 'https:',
  port: 80 | 443,
): WrappedFunction<HttpExport['request']> {
  // avoid double-wrap
  if (!getOriginalFunction(httpModule.request)) {
    const {
      [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated,
    } = getHttpClientSubscriptions(options);

    const originalRequest = httpModule.request;
    wrapMethod(httpModule, 'request', function patchedRequest(this: HttpExport, ...args: unknown[]) {
      // Apply protocol defaults when options are passed as a plain object
      if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
        const opts = args[0] as Record<string, unknown>;
        if ((opts.constructor as { name?: string } | undefined)?.name !== 'URL') {
          args[0] = { protocol, port, ...opts };
        }
      }
      const request = originalRequest.apply(this, args) as HttpClientRequest;
      onHttpClientRequestCreated({ request }, HTTP_ON_CLIENT_REQUEST);
      return request;
    });
  }

  return httpModule.request;
}

function patchHttpGet(httpModule: HttpExport, patchedRequest: WrappedFunction<HttpExport['request']>) {
  if (!getOriginalFunction(httpModule.get)) {
    wrapMethod(httpModule, 'get', function patchedGet(this: HttpExport, ...args: unknown[]) {
      // http.get is like http.request but automatically calls .end()
      const request = patchedRequest.apply(this, args) as HttpClientRequest;
      request.end();
      return request;
    });
  }
}

function patchModule(
  httpModuleExport: HttpModuleExport,
  options: HttpInstrumentationOptions = {},
  protocol: 'http:' | 'https:',
  port: 80 | 443,
): HttpModuleExport {
  const httpDefault = getDefaultExport(httpModuleExport);
  const httpModule = httpModuleExport as HttpExport;
  // if we have a default, patch that, and copy to the import container
  if (httpDefault !== httpModuleExport) {
    patchModule(httpDefault, options, protocol, port);
    // copy with defineProperty because these might be configured oddly
    for (const method of ['get', 'request']) {
      const desc = Object.getOwnPropertyDescriptor(httpDefault, method);
      /* v8 ignore next - will always be set at this point */
      Object.defineProperty(httpModule, method, desc ?? {});
    }
    return httpModule;
  }

  patchHttpGet(httpModule, patchHttpRequest(httpModule, options, protocol, port));
  return httpModuleExport;
}

/**
 * Patch an `http`-module-shaped export so that every outgoing request is
 * tracked as a Sentry span.
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
): HttpModuleExport => patchModule(httpModuleExport, options, 'http:', 80);

/**
 * Patch an `https`-module-shaped export.  Equivalent to `patchHttpModule` but
 * sets default `protocol` / `port` for HTTPS when option objects are passed.
 */
export const patchHttpsModuleClient = (
  httpModuleExport: HttpModuleExport,
  options: HttpInstrumentationOptions = {},
): HttpModuleExport => patchModule(httpModuleExport, options, 'https:', 443);
