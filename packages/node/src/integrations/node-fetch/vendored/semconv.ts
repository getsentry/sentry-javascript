/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/ed97091c9890dd18e52759f2ea98e9d7593b3ae4/packages/instrumentation-undici
 * - Upstream version: @opentelemetry/instrumentation-undici@0.24.0
 * - The semantic-convention constants this package emits, inlined from
 *   `@opentelemetry/semantic-conventions` (matching the sibling vendored dirs).
 */

export const ATTR_HTTP_REQUEST_METHOD = 'http.request.method' as const;
export const ATTR_HTTP_REQUEST_METHOD_ORIGINAL = 'http.request.method_original' as const;
export const ATTR_HTTP_RESPONSE_STATUS_CODE = 'http.response.status_code' as const;
export const ATTR_NETWORK_PEER_ADDRESS = 'network.peer.address' as const;
export const ATTR_NETWORK_PEER_PORT = 'network.peer.port' as const;
export const ATTR_SERVER_ADDRESS = 'server.address' as const;
export const ATTR_SERVER_PORT = 'server.port' as const;
export const ATTR_URL_FULL = 'url.full' as const;
export const ATTR_URL_PATH = 'url.path' as const;
export const ATTR_URL_QUERY = 'url.query' as const;
export const ATTR_URL_SCHEME = 'url.scheme' as const;
export const ATTR_USER_AGENT_ORIGINAL = 'user_agent.original' as const;
