/**
 * @vitest-environment jsdom
 */

import type { Span } from '@sentry/core';
import { getClient } from '@sentry/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReplayContainer } from '../../../src/replay';
import { resetSdkMock } from '../../mocks/resetSdkMock';

let replay: ReplayContainer;

describe('Integration | coreHandlers | handleAfterSegmentSpanEnd', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    replay.stop();
  });

  it('records traceIds from afterSegmentSpanEnd', async () => {
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

    client.emit('afterSegmentSpanEnd', {
      spanContext: () => ({ traceId: 'trace-stream-1', spanId: 'span1', traceFlags: 1 }),
    } as unknown as Span);

    client.emit('afterSegmentSpanEnd', {
      spanContext: () => ({ traceId: 'trace-stream-2', spanId: 'span2', traceFlags: 1 }),
    } as unknown as Span);

    expect(Array.from(replay.getContext().traceIds)).toEqual(['trace-stream-1', 'trace-stream-2']);
  });

  it('limits traceIds from afterSegmentSpanEnd to max. 100', async () => {
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
      client.emit('afterSegmentSpanEnd', {
        spanContext: () => ({ traceId: `tr-${i}`, spanId: `sp-${i}`, traceFlags: 1 }),
      } as unknown as Span);
    }

    expect(replay.getContext().traceIds.size).toBe(100);
    expect(Array.from(replay.getContext().traceIds)).toEqual(
      Array(100)
        .fill(undefined)
        .map((_, i) => `tr-${i}`),
    );
  });

  it('does not record traceIds from afterSegmentSpanEnd when replay is disabled', async () => {
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

    client.emit('afterSegmentSpanEnd', {
      spanContext: () => ({ traceId: 'trace-stream-1', spanId: 'span1', traceFlags: 1 }),
    } as unknown as Span);

    expect(Array.from(replay.getContext().traceIds)).toEqual([]);
  });
});
