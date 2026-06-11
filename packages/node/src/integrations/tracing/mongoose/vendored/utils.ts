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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongoose
 * - Upstream version: @opentelemetry/instrumentation-mongoose@0.64.0
 * - Types vendored from mongoose as simplified interfaces
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */
/* eslint-disable */

import type { Span, SpanAttributes } from '@sentry/core';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import type { Collection } from './mongoose-types';
import {
  ATTR_DB_MONGODB_COLLECTION,
  ATTR_DB_NAME,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from './semconv';

export function getAttributesFromCollection(collection: Collection): SpanAttributes {
  return {
    [ATTR_DB_MONGODB_COLLECTION]: collection.name,
    [ATTR_DB_NAME]: collection.conn.name,
    [ATTR_DB_USER]: collection.conn.user,
    [ATTR_NET_PEER_NAME]: collection.conn.host,
    [ATTR_NET_PEER_PORT]: collection.conn.port,
  };
}

function setErrorStatus(span: Span, error: any = {}): void {
  span.setStatus({
    code: SPAN_STATUS_ERROR,
    message: `${error.message} ${error.code ? `\nMongoose Error Code: ${error.code}` : ''}`,
  });
}

export function handlePromiseResponse(execResponse: any, span: Span): any {
  if (!(execResponse instanceof Promise)) {
    span.end();
    return execResponse;
  }

  return execResponse
    .catch((err: any) => {
      setErrorStatus(span, err);
      throw err;
    })
    .finally(() => span.end());
}

export function handleCallbackResponse(
  callback: Function,
  exec: Function,
  originalThis: any,
  span: Span,
  args: IArguments,
) {
  let callbackArgumentIndex = 0;
  if (args.length === 2) {
    callbackArgumentIndex = 1;
  } else if (args.length === 3) {
    callbackArgumentIndex = 2;
  }

  args[callbackArgumentIndex] = (err: Error, response: any): any => {
    if (err) {
      setErrorStatus(span, err);
    }

    span.end();
    return callback!(err, response);
  };

  return exec.apply(originalThis, args);
}
