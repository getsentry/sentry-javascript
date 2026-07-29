import { captureException } from '@sentry/core';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupEventContextTrace } from '../../src/setupEventContextTrace';
import { mockSdkInit } from '../helpers/mockSdkInit';
import type { TestClient } from '../helpers/TestClient';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('test');

describe('setupEventContextTrace', () => {
  const beforeSend = vi.fn(() => null);
  let client: TestClient;

  beforeEach(() => {
    client = mockSdkInit({ debug: true, beforeSend, tracesSampleRate: 1 });

    setupEventContextTrace(client);
  });

  afterEach(() => {
    beforeSend.mockReset();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('works with no active span', async () => {
    const error = new Error('test');
    captureException(error);
    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: {
            span_id: expect.stringMatching(/[a-f0-9]{16}/),
            trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          },
        }),
      }),
      expect.objectContaining({
        event_id: expect.any(String),
        originalException: error,
        syntheticException: expect.any(Error),
      }),
    );
  });

  it('works with active span', async () => {
    const error = new Error('test');

    let outerId: string | undefined;
    let innerId: string | undefined;
    let traceId: string | undefined;

    tracer?.startActiveSpan('outer', outerSpan => {
      outerId = outerSpan.spanContext().spanId;
      traceId = outerSpan.spanContext().traceId;

      tracer?.startActiveSpan('inner', innerSpan => {
        innerId = innerSpan.spanContext().spanId;
        captureException(error);
      });
    });

    await client.flush();

    expect(outerId).toBeDefined();
    expect(innerId).toBeDefined();
    expect(traceId).toBeDefined();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: {
            span_id: innerId,
            parent_span_id: outerId,
            trace_id: traceId,
          },
        }),
      }),
      expect.objectContaining({
        event_id: expect.any(String),
        originalException: error,
        syntheticException: expect.any(Error),
      }),
    );
  });
});
