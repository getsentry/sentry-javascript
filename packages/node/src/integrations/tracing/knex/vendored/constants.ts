/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-knex
 * - Upstream version: @opentelemetry/instrumentation-knex@0.62.0
 */
/* eslint-disable */

export const MODULE_NAME = 'knex';
export const SUPPORTED_VERSIONS = [
  // use "lib/execution" for runner.js, "lib" for client.js as basepath, latest tested 0.95.6
  '>=0.22.0 <4',
  // use "lib" as basepath
  '>=0.10.0 <0.18.0',
  '>=0.19.0 <0.22.0',
  // use "src" as basepath
  '>=0.18.0 <0.19.0',
];
