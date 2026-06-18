/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongoose
 * - Upstream version: @opentelemetry/instrumentation-mongoose@0.64.0
 * - Types vendored from mongoose as simplified interfaces
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

import { DB_NAME, DB_USER } from '@sentry/conventions/attributes';
import type { Span, SpanAttributes } from '@sentry/core';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import type { Collection, MongooseError } from './mongoose-types';
import { ATTR_DB_MONGODB_COLLECTION, ATTR_NET_PEER_NAME, ATTR_NET_PEER_PORT } from './semconv';

export function getAttributesFromCollection(collection: Collection): SpanAttributes {
  return {
    // eslint-disable-next-line typescript/no-deprecated
    [ATTR_DB_MONGODB_COLLECTION]: collection.name,
    // eslint-disable-next-line typescript/no-deprecated
    [DB_NAME]: collection.conn.name,
    // eslint-disable-next-line typescript/no-deprecated
    [DB_USER]: collection.conn.user,
    // eslint-disable-next-line typescript/no-deprecated
    [ATTR_NET_PEER_NAME]: collection.conn.host,
    // eslint-disable-next-line typescript/no-deprecated
    [ATTR_NET_PEER_PORT]: collection.conn.port,
  };
}

function setErrorStatus(span: Span, error: MongooseError): void {
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
    return callback(err, response);
  };

  return exec.apply(originalThis, args);
}
