/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongoose
 * - Upstream version: @opentelemetry/instrumentation-mongoose@0.64.0
 * - Types vendored from mongoose as simplified interfaces
 */
/* eslint-disable */

import { Attributes, SpanStatusCode, diag, Span } from '@opentelemetry/api';
import type { Collection } from './mongoose-types';
import { MongooseResponseCustomAttributesFunction } from './types';
import { safeExecuteInTheMiddle, SemconvStability } from '@opentelemetry/instrumentation';
import {
  ATTR_DB_MONGODB_COLLECTION,
  ATTR_DB_NAME,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from './semconv';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';

export function getAttributesFromCollection(
  collection: Collection,
  dbSemconvStability: SemconvStability,
  netSemconvStability: SemconvStability,
): Attributes {
  const attrs: Attributes = {};

  if (dbSemconvStability & SemconvStability.OLD) {
    attrs[ATTR_DB_MONGODB_COLLECTION] = collection.name;
    attrs[ATTR_DB_NAME] = collection.conn.name;
    attrs[ATTR_DB_USER] = collection.conn.user;
  }
  if (dbSemconvStability & SemconvStability.STABLE) {
    attrs[ATTR_DB_COLLECTION_NAME] = collection.name;
    attrs[ATTR_DB_NAMESPACE] = collection.conn.name;
  }

  if (netSemconvStability & SemconvStability.OLD) {
    attrs[ATTR_NET_PEER_NAME] = collection.conn.host;
    attrs[ATTR_NET_PEER_PORT] = collection.conn.port;
  }
  if (netSemconvStability & SemconvStability.STABLE) {
    attrs[ATTR_SERVER_ADDRESS] = collection.conn.host;
    attrs[ATTR_SERVER_PORT] = collection.conn.port;
  }

  return attrs;
}

function setErrorStatus(span: Span, error: any = {}) {
  span.recordException(error);

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: `${error.message} ${error.code ? `\nMongoose Error Code: ${error.code}` : ''}`,
  });
}

function applyResponseHook(
  span: Span,
  response: any,
  responseHook?: MongooseResponseCustomAttributesFunction,
  moduleVersion: string | undefined = undefined,
) {
  if (!responseHook) {
    return;
  }

  safeExecuteInTheMiddle(
    () => responseHook(span, { moduleVersion, response }),
    e => {
      if (e) {
        diag.error('mongoose instrumentation: responseHook error', e);
      }
    },
    true,
  );
}

export function handlePromiseResponse(
  execResponse: any,
  span: Span,
  responseHook?: MongooseResponseCustomAttributesFunction,
  moduleVersion: string | undefined = undefined,
): any {
  if (!(execResponse instanceof Promise)) {
    applyResponseHook(span, execResponse, responseHook, moduleVersion);
    span.end();
    return execResponse;
  }

  return execResponse
    .then(response => {
      applyResponseHook(span, response, responseHook, moduleVersion);
      return response;
    })
    .catch(err => {
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
  responseHook?: MongooseResponseCustomAttributesFunction,
  moduleVersion: string | undefined = undefined,
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
    } else {
      applyResponseHook(span, response, responseHook, moduleVersion);
    }

    span.end();
    return callback!(err, response);
  };

  return exec.apply(originalThis, args);
}
