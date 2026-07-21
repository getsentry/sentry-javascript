/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongodb
 * - Upstream version: @opentelemetry/instrumentation-mongodb@0.71.0
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 * - The db/net attribute extraction, `db.statement` scrubbing and span
 *   builder are shared with the orchestrion mongodb integration in
 *   `@sentry/server-utils` so the two emit an identical span shape.
 *   Only the OTel-specific callback/context helpers below remain here.
 */

import type { Span, SpanAttributes } from '@sentry/core';
import { getActiveSpan, SPAN_STATUS_ERROR, withActiveSpan } from '@sentry/core';
import {
  getV3CommandOperation,
  getV3SpanAttributes as sharedGetV3SpanAttributes,
  getV4SpanAttributes as sharedGetV4SpanAttributes,
  startMongoSpan,
} from '@sentry/server-utils';

const ORIGIN = 'auto.db.otel.mongo';

export { getV3CommandOperation, startMongoSpan };

/** Determine a span's attributes from the v4 connection context (OTel origin). */
export function getV4SpanAttributes(connectionCtx: any, ns: any, command?: any, operation?: string): SpanAttributes {
  return sharedGetV4SpanAttributes(connectionCtx, ns, command, operation, ORIGIN);
}

/** Determine a span's attributes from the v3 topology (OTel origin). */
export function getV3SpanAttributes(ns: string, topology: any, command?: any, operation?: string): SpanAttributes {
  return sharedGetV3SpanAttributes(ns, topology, command, operation, ORIGIN);
}

/**
 * Wraps the result handler so it ends the span (with error status on failure) and runs the
 * original callback re-activated under the parent span — mongodb loses the async context when
 * it invokes the callback on a later tick.
 */
export function patchEnd(span: Span | undefined, resultHandler: Function): Function {
  const parentSpan = getActiveSpan();
  let spanEnded = false;

  return function patchedEnd(this: {}, ...args: unknown[]) {
    if (!spanEnded) {
      spanEnded = true;
      const error = args[0];
      if (span) {
        if (error instanceof Error) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: error.message });
        }
        span.end();
      }
    }

    return withActiveSpan(parentSpan ?? null, () => resultHandler.apply(this, args));
  };
}

// The instrumentation only creates spans when there is an active parent span, to avoid emitting
// orphaned mongodb spans.
export function shouldSkipInstrumentation(): boolean {
  return !getActiveSpan();
}
