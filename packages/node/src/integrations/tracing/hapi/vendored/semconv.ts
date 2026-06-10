/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-hapi
 * - Upstream version: @opentelemetry/instrumentation-hapi@0.64.0
 */
/* eslint-disable */

/**
 * Deprecated, use `http.request.method` instead.
 *
 * @example GET
 * @example POST
 * @example HEAD
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `http.request.method`.
 */
export const ATTR_HTTP_METHOD = 'http.method' as const;
