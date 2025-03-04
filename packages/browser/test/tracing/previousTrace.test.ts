import { describe, it, expect, vi } from 'vitest';
import type { PreviousTraceInfo } from '../../src/tracing/previousTrace';
import { addPreviousTraceSpanLink, PREVIOUS_TRACE_MAX_DURATION } from '../../src/tracing/previousTrace';
import type { StartSpanOptions } from '@sentry/core';

describe('addPreviousTraceSpanLink', () => {
  it(`adds a previous_trace span link to startSpanOptions if the previous trace was created within ${PREVIOUS_TRACE_MAX_DURATION}M`, () => {
    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 1,
      },
      // max time reached exactly
      startTimestamp: Date.now() / 1000 - PREVIOUS_TRACE_MAX_DURATION,
    };

    const startSpanOptions: StartSpanOptions = {
      name: '/dashboard',
    };

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, startSpanOptions);

    expect(updatedPreviousTraceInfo).toBe(previousTraceInfo);
    expect(startSpanOptions.links).toEqual([
      {
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
        context: {
          spanId: '456',
          traceFlags: 1,
          traceId: '123',
        },
      },
    ]);
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

    const startSpanOptions: StartSpanOptions = {
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
    };

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, startSpanOptions);

    expect(updatedPreviousTraceInfo).toBe(previousTraceInfo);
    expect(startSpanOptions.links).toEqual([
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
      {
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
        context: {
          spanId: '456',
          traceFlags: 1,
          traceId: '123',
        },
      },
    ]);
  });

  it(`doesn't add a previous_trace span link if the previous trace was created more than ${PREVIOUS_TRACE_MAX_DURATION}M ago`, () => {
    const previousTraceInfo: PreviousTraceInfo = {
      spanContext: {
        traceId: '123',
        spanId: '456',
        traceFlags: 0,
      },
      startTimestamp: Date.now() / 1000 - PREVIOUS_TRACE_MAX_DURATION - 1,
    };

    const startSpanOptions: StartSpanOptions = {
      name: '/dashboard',
    };

    const updatedPreviousTraceInfo = addPreviousTraceSpanLink(previousTraceInfo, startSpanOptions);

    expect(updatedPreviousTraceInfo).toBeUndefined();
    expect(startSpanOptions.links).toBeUndefined();
  });
});

// TODO: Add tests for sessionstorage helpers
