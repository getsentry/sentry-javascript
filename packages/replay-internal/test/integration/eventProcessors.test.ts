/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import type { Event } from '@sentry/core';
import { getClient, getCurrentScope } from '@sentry/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_TIMESTAMP } from '..';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { getTestEventIncremental } from '../utils/getTestEvent';

describe('Integration | eventProcessors', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(() => {
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('handles event processors properly', async () => {
    const MUTATED_TIMESTAMP = BASE_TIMESTAMP + 3000;

    const { mockRecord } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
    });

    const client = getClient()!;

    await vi.runAllTimersAsync();
    const mockTransportSend = vi.spyOn(client.getTransport()!, 'send');
    mockTransportSend.mockReset();

    const handler1 = vi.fn((event: Event): Event | null => {
      event.timestamp = MUTATED_TIMESTAMP;

      return event;
    });

    const handler2 = vi.fn((): Event | null => {
      return null;
    });

    getCurrentScope().addEventProcessor(handler1);

    const TEST_EVENT = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

    mockRecord._emitter(TEST_EVENT);
    vi.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockTransportSend).toHaveBeenCalledTimes(1);

    getCurrentScope().addEventProcessor(handler2);

    const TEST_EVENT2 = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

    mockRecord._emitter(TEST_EVENT2);
    vi.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockTransportSend).toHaveBeenCalledTimes(1);

    expect(handler1).toHaveBeenCalledTimes(2);
    expect(handler2).toHaveBeenCalledTimes(1);

    // This receives an envelope, which is a deeply nested array
    // We only care about the fact that the timestamp was mutated
    expect(mockTransportSend).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ timestamp: MUTATED_TIMESTAMP })])]),
      ]),
    );
  });
});
