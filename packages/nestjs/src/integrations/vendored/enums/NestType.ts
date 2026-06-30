/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-nestjs-core
 * - Upstream version: @opentelemetry/instrumentation-nestjs-core@0.64.0
 */

export enum NestType {
  APP_CREATION = 'app_creation',
  REQUEST_CONTEXT = 'request_context',
  REQUEST_HANDLER = 'handler',
}
