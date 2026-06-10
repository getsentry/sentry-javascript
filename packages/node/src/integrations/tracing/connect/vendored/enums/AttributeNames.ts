/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-connect
 * - Upstream version: @opentelemetry/instrumentation-connect@0.61.0
 */
/* eslint-disable */

export enum AttributeNames {
  CONNECT_TYPE = 'connect.type',
  CONNECT_NAME = 'connect.name',
}

export enum ConnectTypes {
  MIDDLEWARE = 'middleware',
  REQUEST_HANDLER = 'request_handler',
}

export enum ConnectNames {
  MIDDLEWARE = 'middleware',
  REQUEST_HANDLER = 'request handler',
}
