/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/ed97091c9890dd18e52759f2ea98e9d7593b3ae4/packages/instrumentation-undici
 * - Upstream version: @opentelemetry/instrumentation-undici@0.24.0
 * - Tracking issue: https://github.com/getsentry/sentry-javascript/issues/20165
 * - Dropped the `@opentelemetry/instrumentation` `InstrumentationConfig` base (its only field used
 *   here, `enabled`, is unused by the Sentry integration)
 */

import type { Span } from '@sentry/core';

export interface UndiciRequest {
  origin: string;
  method: string;
  path: string;
  /**
   * Serialized string of headers in the form `name: value\r\n` for v5
   * Array of strings `[key1, value1, key2, value2]`, where values are
   * `string | string[]` for v6
   */
  headers: string | (string | string[])[];
  /**
   * Helper method to add headers (from v6)
   */
  addHeader: (name: string, value: string) => void;
  throwOnError: boolean;
  completed: boolean;
  aborted: boolean;
  idempotent: boolean;
  contentLength: number | null;
  contentType: string | null;
  // oxlint-disable-next-line typescript/no-explicit-any
  body: any;
}

export interface UndiciResponse {
  headers: Buffer[];
  statusCode: number;
  statusText: string;
}

export interface RequestHookFunction<T = UndiciRequest> {
  (span: Span, request: T): void;
}

export interface ResponseHookFunction<RequestType = UndiciRequest, ResponseType = UndiciResponse> {
  (span: Span, info: { request: RequestType; response: ResponseType }): void;
}

export interface RequestMessage {
  request: UndiciRequest;
}

export interface RequestHeadersMessage {
  request: UndiciRequest;
  // oxlint-disable-next-line typescript/no-explicit-any
  socket: any;
}

export interface ResponseHeadersMessage {
  request: UndiciRequest;
  response: UndiciResponse;
}

export interface RequestTrailersMessage {
  request: UndiciRequest;
  response: UndiciResponse;
}

export interface RequestErrorMessage {
  request: UndiciRequest;
  error: Error;
}

// This package will instrument HTTP requests made through `undici` or  `fetch` global API
// so it seems logical to have similar options than the HTTP instrumentation
export interface UndiciInstrumentationConfig<RequestType = UndiciRequest, ResponseType = UndiciResponse> {
  /**
   * Do not capture spans or breadcrumbs for outgoing fetch requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
  /** Function for adding custom attributes before request is handled */
  requestHook?: RequestHookFunction<RequestType>;
  /** Function called once response headers have been received */
  responseHook?: ResponseHookFunction<RequestType, ResponseType>;
  /** Map the following HTTP headers to span attributes. */
  headersToSpanAttributes?: {
    requestHeaders?: string[];
    responseHeaders?: string[];
  };
}

export interface NodeFetchOptions extends UndiciInstrumentationConfig {
  /**
   * Whether breadcrumbs should be recorded for requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * If set to false, do not emit any spans.
   * Breadcrumbs and trace propagation for outgoing fetch requests are still applied.
   *
   * If `skipOpenTelemetrySetup: true` is configured, this defaults to `false`, otherwise it defaults to `true`.
   */
  spans?: boolean;

  /**
   * This option only has an effect when `spans` is set to false. When spans are enabled, you cannot disable trace propagation here.
   * Instead, configure `tracePropagationTargets` in the client options.
   *
   * @default `true`
   */
  tracePropagation?: boolean;
}
