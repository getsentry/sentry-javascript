/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/ed97091c9890dd18e52759f2ea98e9d7593b3ae4/packages/instrumentation-undici
 * - Upstream version: @opentelemetry/instrumentation-undici@0.24.0
 * - Tracking issue: https://github.com/getsentry/sentry-javascript/issues/20165
 */

import type { UndiciRequest, UndiciResponse } from './types';

export interface ListenerRecord {
  name: string;
  unsubscribe: () => void;
}

export interface RequestMessage {
  request: UndiciRequest;
}

export interface RequestHeadersMessage {
  request: UndiciRequest;
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
