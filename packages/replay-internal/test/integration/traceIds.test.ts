/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import { getCurrentScope } from '@sentry/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleAfterSendEvent } from '../../src/coreHandlers/handleAfterSendEvent';
import type { ReplayContainer } from '../../src/replay';
import { Transaction } from '../fixtures/transaction';
import { BASE_TIMESTAMP } from '../index';
import type { RecordMock } from '../mocks/mockRrweb';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { getTestEventIncremental } from '../utils/getTestEvent';

let replay: ReplayContainer;
let mockRecord: RecordMock;

describe('Integration | traceIds', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    replay.stop();
  });

  it('preserves the most recent trace id across flushes', async () => {
    ({ replay, mockRecord } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const handler = handleAfterSendEvent(replay);

    // After initial flush from resetSdkMock, the context has a propagation
    // context trace ID. Clear it for a clean test.
    replay['_context'].traceIds = [];

    // Simulate 3 transaction events with known trace IDs
    handler(Transaction('trace-aaa'), { statusCode: 200 });
    handler(Transaction('trace-bbb'), { statusCode: 200 });
    handler(Transaction('trace-ccc'), { statusCode: 200 });

    expect(replay.getContext().traceIds).toHaveLength(3);

    // Emit a recording event so the event buffer is not empty (flush needs events)
    mockRecord._emitter(getTestEventIncremental({ timestamp: BASE_TIMESTAMP }));

    // Trigger a flush by advancing timers
    await vi.advanceTimersToNextTimerAsync();

    // After the flush, _clearContext should preserve only the most recent trace id
    expect(replay.getContext().traceIds).toHaveLength(1);
    expect(replay.getContext().traceIds[0]![1]).toBe('trace-ccc');

    // Verify the sent replay event contained all 3 trace IDs
    expect(replay).toHaveLastSentReplay({
      replayEventPayload: expect.objectContaining({
        trace_ids: ['trace-aaa', 'trace-bbb', 'trace-ccc'],
        traces_by_timestamp: [
          [expect.any(Number), 'trace-aaa'],
          [expect.any(Number), 'trace-bbb'],
          [expect.any(Number), 'trace-ccc'],
        ],
      }),
    });
  });

  it('carries over last trace id to next segment', async () => {
    ({ replay, mockRecord } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const handler = handleAfterSendEvent(replay);

    // Clear initial propagation context trace for clean test
    replay['_context'].traceIds = [];

    // Add two trace IDs
    handler(Transaction('trace-first'), { statusCode: 200 });
    handler(Transaction('trace-second'), { statusCode: 200 });

    // Emit a recording event so the buffer has events for the flush
    mockRecord._emitter(getTestEventIncremental({ timestamp: BASE_TIMESTAMP }));

    // Flush segment 1
    await vi.advanceTimersToNextTimerAsync();

    // After flush, last trace id should carry over
    expect(replay.getContext().traceIds).toHaveLength(1);
    expect(replay.getContext().traceIds[0]![1]).toBe('trace-second');

    // Add a new trace ID for the next segment
    handler(Transaction('trace-third'), { statusCode: 200 });

    // Emit another recording event for the next flush
    mockRecord._emitter(getTestEventIncremental({ timestamp: BASE_TIMESTAMP + 5000 }));

    // Flush segment 2
    await vi.advanceTimersToNextTimerAsync();

    // The second segment should include the carried-over trace-second plus the new trace-third
    expect(replay).toHaveLastSentReplay({
      replayEventPayload: expect.objectContaining({
        trace_ids: ['trace-second', 'trace-third'],
        traces_by_timestamp: [
          [expect.any(Number), 'trace-second'],
          [expect.any(Number), 'trace-third'],
        ],
      }),
    });
  });

  it('falls back to propagation context trace id when no transaction events are captured', async () => {
    ({ replay, mockRecord } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    // Clear initial trace IDs
    replay['_context'].traceIds = [];

    // Set a known trace ID on the current scope's propagation context
    const knownTraceId = 'abc123def456abc123def456abc123de';
    getCurrentScope().setPropagationContext({
      traceId: knownTraceId,
      sampleRand: 1,
    });

    // Emit a recording event so the buffer has events for the flush
    mockRecord._emitter(getTestEventIncremental({ timestamp: BASE_TIMESTAMP }));

    // Flush without sending any transaction events
    await vi.advanceTimersToNextTimerAsync();

    // The replay event should contain the propagation context trace ID
    expect(replay).toHaveLastSentReplay({
      replayEventPayload: expect.objectContaining({
        trace_ids: [knownTraceId],
        traces_by_timestamp: [[expect.any(Number), knownTraceId]],
      }),
    });
  });

  it('does not use propagation context fallback when transaction trace ids exist', async () => {
    ({ replay, mockRecord } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const handler = handleAfterSendEvent(replay);

    // Clear initial trace IDs
    replay['_context'].traceIds = [];

    // Set a known propagation context trace ID that should NOT appear
    getCurrentScope().setPropagationContext({
      traceId: 'propagation00000000000000000000',
      sampleRand: 1,
    });

    // Send a transaction event
    handler(Transaction('actual-trace-id'), { statusCode: 200 });

    // Emit a recording event so the buffer has events for the flush
    mockRecord._emitter(getTestEventIncremental({ timestamp: BASE_TIMESTAMP }));

    // Flush
    await vi.advanceTimersToNextTimerAsync();

    // The replay event should only contain the transaction trace ID, not propagation context
    expect(replay).toHaveLastSentReplay({
      replayEventPayload: expect.objectContaining({
        trace_ids: ['actual-trace-id'],
        traces_by_timestamp: [[expect.any(Number), 'actual-trace-id']],
      }),
    });
  });

  it('deduplicates trace_ids but preserves all entries in traces_by_timestamp', async () => {
    ({ replay, mockRecord } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const handler = handleAfterSendEvent(replay);

    // Clear initial trace IDs
    replay['_context'].traceIds = [];

    // Send multiple transactions with the same trace ID
    handler(Transaction('same-trace-id'), { statusCode: 200 });
    handler(Transaction('same-trace-id'), { statusCode: 200 });
    handler(Transaction('different-trace-id'), { statusCode: 200 });

    // Emit a recording event so the buffer has events for the flush
    mockRecord._emitter(getTestEventIncremental({ timestamp: BASE_TIMESTAMP }));

    // Flush
    await vi.advanceTimersToNextTimerAsync();

    // trace_ids should be deduplicated, but traces_by_timestamp should have all entries
    expect(replay).toHaveLastSentReplay({
      replayEventPayload: expect.objectContaining({
        trace_ids: ['same-trace-id', 'different-trace-id'],
        traces_by_timestamp: [
          [expect.any(Number), 'same-trace-id'],
          [expect.any(Number), 'same-trace-id'],
          [expect.any(Number), 'different-trace-id'],
        ],
      }),
    });
  });

  it('skips transaction events without start_timestamp', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const handler = handleAfterSendEvent(replay);

    // Clear initial trace IDs
    replay['_context'].traceIds = [];

    // Create a transaction without start_timestamp
    const transactionWithoutTimestamp = Transaction('trace-no-ts');
    delete transactionWithoutTimestamp.start_timestamp;

    handler(transactionWithoutTimestamp, { statusCode: 200 });

    // Also send a valid transaction
    handler(Transaction('trace-valid'), { statusCode: 200 });

    // Only the valid transaction should be recorded
    const traceIds = replay.getContext().traceIds;
    expect(traceIds).toHaveLength(1);
    expect(traceIds[0]![1]).toBe('trace-valid');
  });

  it('preserves single trace id in _clearContext when only one exists', async () => {
    ({ replay, mockRecord } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const handler = handleAfterSendEvent(replay);

    // Clear initial trace IDs
    replay['_context'].traceIds = [];

    // Add a single transaction
    handler(Transaction('only-trace'), { statusCode: 200 });

    expect(replay.getContext().traceIds).toHaveLength(1);

    // Emit a recording event so the buffer has events for the flush
    mockRecord._emitter(getTestEventIncremental({ timestamp: BASE_TIMESTAMP }));

    // Flush
    await vi.advanceTimersToNextTimerAsync();

    // With only 1 trace id, _clearContext should preserve it (length <= 1, no slicing needed)
    expect(replay.getContext().traceIds).toHaveLength(1);
    expect(replay.getContext().traceIds[0]![1]).toBe('only-trace');
  });
});
