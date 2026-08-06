import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { getCurrentScope } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '../../src/';
import type { NodeClient } from '../../src/sdk/client';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

const FOREIGN_TRACE_ID = 'a'.repeat(32);
const FOREIGN_SPAN_ID = 'b'.repeat(16);

// A span owned by the user's own OpenTelemetry SDK, not by Sentry.
const foreignOtelSpan = {
  spanContext: () => ({ traceId: FOREIGN_TRACE_ID, spanId: FOREIGN_SPAN_ID, traceFlags: 1 }),
} as unknown as Span;

describe('setupEventContextTrace gating', () => {
  afterEach(() => {
    cleanupOtel();
    vi.restoreAllMocks();
  });

  it('does not let a foreign OpenTelemetry span override the Sentry trace on errors in the no-provider default', async () => {
    // Simulate a user running their own OpenTelemetry instrumentation alongside Sentry: their context
    // manager surfaces an active span via `@opentelemetry/api`.
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(foreignOtelSpan);

    const beforeSend = vi.fn(() => null);
    mockSdkInit({ beforeSend });
    const client = Sentry.getClient() as NodeClient;

    const sentryTraceId = getCurrentScope().getPropagationContext().traceId;
    expect(sentryTraceId).not.toBe(FOREIGN_TRACE_ID);

    const error = new Error('boom');
    Sentry.captureException(error);
    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: expect.objectContaining({ trace_id: sentryTraceId }),
        }),
      }),
      expect.objectContaining({ originalException: error }),
    );
  });

  it('links errors to the active OpenTelemetry span when the tracer provider is enabled', async () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(foreignOtelSpan);

    const beforeSend = vi.fn(() => null);
    mockSdkInit({ beforeSend, skipOpenTelemetrySetup: false });
    const client = Sentry.getClient() as NodeClient;

    const error = new Error('boom');
    Sentry.captureException(error);
    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: expect.objectContaining({ trace_id: FOREIGN_TRACE_ID, span_id: FOREIGN_SPAN_ID }),
        }),
      }),
      expect.objectContaining({ originalException: error }),
    );
  });
});
