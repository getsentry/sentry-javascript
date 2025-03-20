import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PreviousTraceInfo } from '../../src/tracing/previousTrace';
import {
  addPreviousTraceSpanLink,
  getPreviousTraceFromSessionStorage,
  PREVIOUS_TRACE_KEY,
  PREVIOUS_TRACE_MAX_DURATION,
} from '../../src/tracing/previousTrace';
import { SentrySpan, spanToJSON, timestampInSeconds } from '@sentry/core';
import { storePreviousTraceInSessionStorage } from '../../src/tracing/previousTrace';

describe('addPreviousTraceSpanLink', () => {
  it(`adds a previous_trace span link to startSpanOptions if the previous trace was created within ${PREVIOUS_TRACE_MAX_DURATION}s`, () => {
    const currentSpanStart = timestampInSeconds();

    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      // max time reached almost exactly
      startTimestamp: currentSpanStart - PREVIOUS_TRACE_MAX_DURATION + 1,
    };

    const currentSpan = new SentrySpan({
      name: 'test',
      startTimestamp: currentSpanStart,
      parentSpanId: '789',
      spanId: 'abc',
      traceId: 'def',
      sampled: true,
    });

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, currentSpan);

    expect(spanToJSON(currentSpan).links).toEqual([
      {
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
        trace_id: '123',
        span_id: '456',
        sampled: true,
      },
    ]);

    expect(updatedPreviousTraceInfo).toEqual({
      spanContext: currentSpan.spanContext(),
      startTimestamp: currentSpanStart,
    });
  });

  it(`doesn't add a previous_trace span link if the previous trace was created more than ${PREVIOUS_TRACE_MAX_DURATION}s ago`, () => {
    const currentSpanStart = timestampInSeconds();

    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 0,
      },
      startTimestamp: Date.now() / 1000 - PREVIOUS_TRACE_MAX_DURATION - 1,
    };

    const currentSpan = new SentrySpan({
      name: '/dashboard',
      startTimestamp: currentSpanStart,
    });

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, currentSpan);

    expect(spanToJSON(currentSpan).links).toBeUndefined();

    // but still updates the previousTraceInfo to the current span
    expect(updatedPreviousTraceInfo).toEqual({
      spanContext: currentSpan.spanContext(),
      startTimestamp: currentSpanStart,
    });
  });

  it("doesn't overwrite previously existing span links", () => {
    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      startTimestamp: Date.now() / 1000,
    };

    const currentSpanStart = timestampInSeconds();

    const currentSpan = new SentrySpan({
      name: '/dashboard',
      links: [
        {
          context: {
            traceId: '789',
            spanId: '101',
            traceFlags: 1,
          },
          attributes: {
            someKey: 'someValue',
          },
        },
      ],
      startTimestamp: currentSpanStart,
    });

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, currentSpan);

    expect(spanToJSON(currentSpan).links).toEqual([
      {
        trace_id: '789',
        span_id: '101',
        sampled: true,
        attributes: {
          someKey: 'someValue',
        },
      },
      {
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
        trace_id: '123',
        span_id: '456',
        sampled: true,
      },
    ]);

    expect(updatedPreviousTraceInfo).toEqual({
      spanContext: currentSpan.spanContext(),
      startTimestamp: currentSpanStart,
    });
  });

  it("doesn't add a link and returns the current span's data as previous trace info, if previous trace info was undefined", () => {
    const currentSpanStart = timestampInSeconds();
    const currentSpan = new SentrySpan({ name: 'test', startTimestamp: currentSpanStart });

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(undefined, currentSpan);

    expect(spanToJSON(currentSpan).links).toBeUndefined();

    expect(updatedPreviousTraceInfo).toEqual({
      spanContext: currentSpan.spanContext(),
      startTimestamp: currentSpanStart,
    });
  });

  it("doesn't add a link and returns the unchanged previous trace info if the current span is part of the same trace", () => {
    const currentSpanStart = timestampInSeconds();
    const currentSpan = new SentrySpan({
      name: 'test',
      startTimestamp: currentSpanStart,
      traceId: '123',
      spanId: '456',
    });

    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      startTimestamp: currentSpanStart - 1,
    };

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, currentSpan);

    expect(spanToJSON(currentSpan).links).toBeUndefined();

    expect(updatedPreviousTraceInfo).toBe(previousTraceInfo);
  });
});

describe('store and retrieve previous trace data via sessionStorage ', () => {
  const storage: Record<string, unknown> = {};
  const sessionStorageMock = {
    setItem: vi.fn((key, value) => {
      storage[key] = value;
    }),
    getItem: vi.fn(key => storage[key]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - mock contains only necessary API
    globalThis.sessionStorage = sessionStorageMock;
  });

  it('stores the previous trace info in sessionStorage', () => {
    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      startTimestamp: Date.now() / 1000,
    };

    storePreviousTraceInSessionStorage(previousTraceInfo);
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(PREVIOUS_TRACE_KEY, JSON.stringify(previousTraceInfo));
    expect(getPreviousTraceFromSessionStorage()).toEqual(previousTraceInfo);
  });

  it("doesn't throw if accessing sessionStorage fails and returns undefined", () => {
    // @ts-expect-error - this is fine
    globalThis.sessionStorage = undefined;

    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      startTimestamp: Date.now() / 1000,
    };

    expect(() => storePreviousTraceInSessionStorage(previousTraceInfo)).not.toThrow();
    expect(getPreviousTraceFromSessionStorage).not.toThrow();
    expect(getPreviousTraceFromSessionStorage()).toBeUndefined();
  });
});
