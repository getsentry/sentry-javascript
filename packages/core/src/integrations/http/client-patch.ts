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

/**
 * Patch `ClientRequest.prototype.onSocket` so that every outgoing request is
 * routed through our instrumentation.
 *
 * We deliberately patch the shared `ClientRequest` prototype rather than the
 * module's `request`/`get` exports. Every outgoing request — no matter how the
 * module was imported (`require('node:http')`, `import http from 'node:http'`,
 * or `import * as http from 'node:http'`) — ultimately constructs a
 * `ClientRequest` and invokes `onSocket` on this one prototype. ES module
 * namespace bindings (`import * as http` / `import { request }`) are immutable
 * snapshots that cannot be monkey-patched at all, but the prototype is a
 * shared, mutable object, so patching it reaches those consumers too.
 *
 * `onSocket` runs synchronously while the request is being set up: before the
 * headers are flushed (so we can still inject trace-propagation headers) and in
 * the caller's async context (so spans are parented correctly). It is invoked
 * exactly once per request, including for reused keep-alive sockets and
 * `agent: false` requests.
 *
 * `https` requests reuse `http`'s `ClientRequest`, so patching `http` covers
 * both; the `https` module does not expose its own `ClientRequest` and is a
 * no-op here.
 */
function patchClientRequest(httpModule: HttpExport, options: HttpInstrumentationOptions): void {
  const proto = httpModule.ClientRequest?.prototype;

  // Nothing to patch if the module doesn't expose `ClientRequest` (e.g.
  // `https`), or if `onSocket` was already wrapped. The latter also covers the
  // case where `https`'s `ClientRequest` inherits `http`'s already-patched
  // `onSocket`, avoiding double instrumentation.
  if (typeof proto?.onSocket !== 'function' || getOriginalFunction(proto.onSocket)) {
    return;
  }

  const { [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated } = getHttpClientSubscriptions({
    ...options,
    http: httpModule,
  });

  const originalOnSocket = proto.onSocket;
  wrapMethod(proto, 'onSocket', function patchedOnSocket(this: HttpClientRequest, ...args: unknown[]) {
    // Never let instrumentation errors break the underlying request.
    try {
      onHttpClientRequestCreated({ request: this }, HTTP_ON_CLIENT_REQUEST);
    } catch {
      // ignore
    }
    return originalOnSocket.apply(this, args);
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
 * import { patchHttpModule } from '@sentry/core';
 * patchHttpModule(http, { propagateTrace: true });
 * ```
 */
export const patchHttpModuleClient = (
  httpModuleExport: HttpModuleExport,
  options: HttpInstrumentationOptions = {},
): HttpModuleExport => patchModule(httpModuleExport, options);
