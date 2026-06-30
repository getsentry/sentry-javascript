/**
 * @vitest-environment jsdom
 */

import type { StreamedSpanJSON } from '@sentry/core';
import { getClient } from '@sentry/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReplayContainer } from '../../../src/replay';
import { resetSdkMock } from '../../mocks/resetSdkMock';

let replay: ReplayContainer;

describe('Integration | coreHandlers | handleProcessSegmentSpan', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    replay.stop();
  });

  it('records traceIds and segment names from processSegmentSpan', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const client = getClient()!;

    client.emit('processSegmentSpan', {
      trace_id: 'trace-stream-1',
      span_id: 'span1',
      name: 'GET /api/users',
      is_segment: true,
      start_timestamp: 0,
      end_timestamp: 1,
      status: 'ok',
    } as StreamedSpanJSON);

    client.emit('processSegmentSpan', {
      trace_id: 'trace-stream-2',
      span_id: 'span2',
      name: 'POST /api/items',
      is_segment: true,
      start_timestamp: 0,
      end_timestamp: 1,
      status: 'ok',
    } as StreamedSpanJSON);

    expect(Array.from(replay.getContext().traceIds)).toEqual(['trace-stream-1', 'trace-stream-2']);
    expect(Array.from(replay.getContext().segmentNames)).toEqual(['GET /api/users', 'POST /api/items']);
  });

  it('limits traceIds from processSegmentSpan to max. 100', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const client = getClient()!;

    for (let i = 0; i < 150; i++) {
      client.emit('processSegmentSpan', {
        trace_id: `tr-${i}`,
        span_id: `sp-${i}`,
        name: `segment-${i}`,
        is_segment: true,
        start_timestamp: 0,
        end_timestamp: 1,
        status: 'ok',
      } as StreamedSpanJSON);
    }

    expect(replay.getContext().traceIds.size).toBe(100);
    expect(Array.from(replay.getContext().traceIds)).toEqual(
      Array(100)
        .fill(undefined)
        .map((_, i) => `tr-${i}`),
    );
  });

  it('does not record traceIds from processSegmentSpan when replay is disabled', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const client = getClient()!;

    replay['_isEnabled'] = false;

    client.emit('processSegmentSpan', {
      trace_id: 'trace-stream-1',
      span_id: 'span1',
      name: 'GET /api/users',
      is_segment: true,
      start_timestamp: 0,
      end_timestamp: 1,
      status: 'ok',
    } as StreamedSpanJSON);

    expect(Array.from(replay.getContext().traceIds)).toEqual([]);
  });

  it('does not record segment spans with empty names', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const client = getClient()!;

    client.emit('processSegmentSpan', {
      trace_id: 'trace-stream-1',
      span_id: 'span1',
      name: '',
      is_segment: true,
      start_timestamp: 0,
      end_timestamp: 1,
      status: 'ok',
    } as StreamedSpanJSON);

    expect(Array.from(replay.getContext().traceIds)).toEqual([]);
    expect(Array.from(replay.getContext().segmentNames)).toEqual([]);
  });
});
