import type { Event } from '@sentry/core';
import { getGlobalScope, GLOBAL_OBJ } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isEmptyBaseServerTrace } from '../../src/common/utils/tracingUtils';
import { init } from '../../src/server';

// normally this is set as part of the build process, so mock it here
(GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRewriteFramesDistDir: string })._sentryRewriteFramesDistDir = '.next';

describe('NextLowQualityTransactionsFilter', () => {
  afterEach(() => {
    vi.clearAllMocks();

    SentryNode.getGlobalScope().clear();
    SentryNode.getIsolationScope().clear();
    SentryNode.getCurrentScope().clear();
    SentryNode.getCurrentScope().setClient(undefined);
  });

  function getEventProcessor(): (event: Event) => Event | null {
    init({});

    const eventProcessors = getGlobalScope()['_eventProcessors'];
    const processor = eventProcessors.find(
      (p: { id?: string }) => p.id === 'NextLowQualityTransactionsFilter',
    );
    expect(processor).toBeDefined();
    return processor as (event: Event) => Event | null;
  }

  it('drops transactions with sentry.drop_transaction attribute', () => {
    const processor = getEventProcessor();

    const event: Event = {
      type: 'transaction',
      transaction: 'GET /api/hello',
      contexts: {
        trace: {
          data: {
            'sentry.drop_transaction': true,
          },
        },
      },
    };

    expect(processor(event)).toBeNull();
  });

  it('drops empty BaseServer.handleRequest transactions (defensive check for context loss)', () => {
    const processor = getEventProcessor();

    const event: Event = {
      type: 'transaction',
      transaction: 'GET /api/hello',
      contexts: {
        trace: {
          trace_id: 'abc123',
          span_id: 'def456',
          parent_span_id: 'parent789',
          data: {
            'next.span_type': 'BaseServer.handleRequest',
          },
        },
      },
      spans: [],
    };

    expect(processor(event)).toBeNull();
  });

  it('drops BaseServer.handleRequest transactions with undefined spans', () => {
    const processor = getEventProcessor();

    const event: Event = {
      type: 'transaction',
      transaction: 'GET /api/hello',
      contexts: {
        trace: {
          trace_id: 'abc123',
          span_id: 'def456',
          data: {
            'next.span_type': 'BaseServer.handleRequest',
          },
        },
      },
      // spans is undefined
    };

    expect(processor(event)).toBeNull();
  });

  it('keeps BaseServer.handleRequest transactions with child spans', () => {
    const processor = getEventProcessor();

    const event: Event = {
      type: 'transaction',
      transaction: 'GET /api/hello',
      contexts: {
        trace: {
          trace_id: 'abc123',
          span_id: 'def456',
          data: {
            'next.span_type': 'BaseServer.handleRequest',
          },
        },
      },
      spans: [
        {
          trace_id: 'abc123',
          span_id: 'child1',
          parent_span_id: 'def456',
          start_timestamp: 1000,
          timestamp: 1001,
          description: 'executing api route (pages) /api/hello',
        },
      ],
    };

    expect(processor(event)).toBe(event);
  });

  it('keeps non-BaseServer.handleRequest transactions even without spans', () => {
    const processor = getEventProcessor();

    const event: Event = {
      type: 'transaction',
      transaction: 'GET /api/hello',
      contexts: {
        trace: {
          trace_id: 'abc123',
          span_id: 'def456',
          data: {
            'sentry.origin': 'auto.http.nextjs',
          },
        },
      },
      spans: [],
    };

    expect(processor(event)).toBe(event);
  });

  it('passes through non-transaction events unchanged', () => {
    const processor = getEventProcessor();

    const event: Event = {
      message: 'test error',
    };

    expect(processor(event)).toBe(event);
  });

  it('drops static asset transactions', () => {
    const processor = getEventProcessor();

    const event: Event = {
      type: 'transaction',
      transaction: 'GET /_next/static/chunks/main.js',
    };

    expect(processor(event)).toBeNull();
  });

  it('drops /404 transactions', () => {
    const processor = getEventProcessor();

    expect(
      processor({
        type: 'transaction',
        transaction: '/404',
      }),
    ).toBeNull();

    expect(
      processor({
        type: 'transaction',
        transaction: 'GET /404',
      }),
    ).toBeNull();
  });
});

describe('isEmptyBaseServerTrace', () => {
  it('returns true for empty BaseServer.handleRequest transactions', () => {
    expect(
      isEmptyBaseServerTrace({
        type: 'transaction',
        contexts: { trace: { data: { 'next.span_type': 'BaseServer.handleRequest' } } },
        spans: [],
      }),
    ).toBe(true);
  });

  it('returns true when spans is undefined', () => {
    expect(
      isEmptyBaseServerTrace({
        type: 'transaction',
        contexts: { trace: { data: { 'next.span_type': 'BaseServer.handleRequest' } } },
      }),
    ).toBe(true);
  });

  it('returns false when BaseServer.handleRequest has child spans', () => {
    expect(
      isEmptyBaseServerTrace({
        type: 'transaction',
        contexts: { trace: { data: { 'next.span_type': 'BaseServer.handleRequest' } } },
        spans: [{ span_id: 'child', trace_id: 'abc', start_timestamp: 0 }],
      }),
    ).toBe(false);
  });

  it('returns false for non-BaseServer.handleRequest transactions', () => {
    expect(
      isEmptyBaseServerTrace({
        type: 'transaction',
        contexts: { trace: { data: { 'sentry.origin': 'auto.http.nextjs' } } },
        spans: [],
      }),
    ).toBe(false);
  });

  it('returns false for non-transaction events', () => {
    expect(
      isEmptyBaseServerTrace({
        message: 'test error',
      }),
    ).toBe(false);
  });
});
