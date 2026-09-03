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

let onHttpClientRequestCreated: ReturnType<typeof getHttpClientSubscriptions>[typeof HTTP_ON_CLIENT_REQUEST];

/**
 * Patch `ClientRequest.prototype._storeHeader` so that every outgoing request
 * is routed through our instrumentation.
 *
 * We deliberately patch the shared `ClientRequest` prototype rather than the
 * module's `request`/`get` exports. Every outgoing request — no matter how the
 * module was imported (`require('node:http')`, `import http from 'node:http'`,
 * or `import * as http from 'node:http'`) — ultimately constructs a
 * `ClientRequest` and serializes its headers through `_storeHeader` on this one
 * prototype. ES module namespace bindings (`import * as http` / `import
 * { request }`) are immutable snapshots that cannot be monkey-patched at all,
 * but the prototype is a shared, mutable object, so patching it reaches those
 * consumers too.
 *
 * `_storeHeader` is the method that renders the outgoing header block into
 * `request._header`. We run *before* the original, which is the last moment a
 * header can still be added via `setHeader` (afterwards `request._header` is
 * set and any `setHeader` call throws `ERR_HTTP_HEADERS_SENT`). It runs
 * synchronously in the caller's async context — during `request.end()` /
 * `request.write()` — so spans are parented correctly, and is invoked exactly
 * once per request whether the headers are being sent immediately or buffered
 * while a socket is assigned.
 *
 * We intentionally do *not* hook `onSocket`: it does not fire until a socket is
 * assigned to the request, which for an `Agent` with all sockets busy (e.g.
 * `maxSockets: 1`) happens only *after* the request's headers have already been
 * serialized — far too late to inject trace-propagation headers.
 *
 * `https` requests reuse `http`'s `ClientRequest`, so patching `http` covers
 * both; the `https` module does not expose its own `ClientRequest` and is a
 * no-op here.
 */
function patchClientRequest(httpModule: HttpExport, options: HttpInstrumentationOptions): void {
  const proto = httpModule.ClientRequest?.prototype;

  // Nothing to patch if the module doesn't expose `ClientRequest` (e.g. `https`)
  if (typeof proto?._storeHeader !== 'function') {
    return;
  }

  const subscriptions = getHttpClientSubscriptions({
    ...options,
    http: httpModule,
  });

  onHttpClientRequestCreated = subscriptions[HTTP_ON_CLIENT_REQUEST];

  // This means it was already wrapped, we just update onHttpClientRequestCreated and then stop
  // future calls will pick up the new function
  if (getOriginalFunction(proto._storeHeader)) {
    return;
  }

  const originalStoreHeader = proto._storeHeader;
  wrapMethod(proto, '_storeHeader', function patchedStoreHeader(this: HttpClientRequest, ...args: unknown[]) {
    // Never let instrumentation errors break the underlying request.
    try {
      onHttpClientRequestCreated({ request: this }, HTTP_ON_CLIENT_REQUEST);
    } catch {
      // ignore
    }
    return originalStoreHeader.apply(this, args);
  });
}

function patchModule(httpModuleExport: HttpModuleExport, options: HttpInstrumentationOptions = {}): HttpModuleExport {
  // Resolve to the underlying module in case we were handed an interop
  // container (e.g. `{ default: http }`). Either the container or its default
  // export carries the same `ClientRequest` class.
  const httpModule = getDefaultExport(httpModuleExport);
  patchClientRequest(httpModule, options);
  return httpModuleExport;
}

/**
 * Patch `node:http`. This also covers `node:https` as it reuses the same `ClientRequest` class.
 *
 * @example
 * ```javascript
 * import http from 'http';
 * import { patchHttpModuleClient } from '@sentry/core';
 * patchHttpModuleClient(http, { tracePropagation: true });
 * ```
 */
export const patchHttpModuleClient = (
  httpModuleExport: HttpModuleExport,
  options: HttpInstrumentationOptions = {},
): HttpModuleExport => patchModule(httpModuleExport, options);
