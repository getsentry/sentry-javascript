import { getCurrentHub } from '@sentry/core';
import { Event, Hub, Scope } from '@sentry/types';

import { BASE_TIMESTAMP } from '..';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | eventProcessors', () => {
  let hub: Hub;
  let scope: Scope;

  beforeEach(() => {
    hub = getCurrentHub();
    scope = hub.pushScope();
  });

  afterEach(() => {
    hub.popScope();
    jest.resetAllMocks();
  });

  it('handles event processors properly', async () => {
    const MUTATED_TIMESTAMP = BASE_TIMESTAMP + 3000;

    const { mockRecord } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
    });

    const client = hub.getClient()!;

    jest.runAllTimers();
    const mockTransportSend = jest.spyOn(client.getTransport()!, 'send');
    mockTransportSend.mockReset();

    const handler1 = jest.fn((event: Event): Event | null => {
      event.timestamp = MUTATED_TIMESTAMP;

      return event;
    });

    const handler2 = jest.fn((): Event | null => {
      return null;
    });

    scope.addEventProcessor(handler1);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

    mockRecord._emitter(TEST_EVENT);
    jest.runAllTimers();
    jest.advanceTimersByTime(1);
    await new Promise(process.nextTick);

    expect(mockTransportSend).toHaveBeenCalledTimes(1);

    scope.addEventProcessor(handler2);

    const TEST_EVENT2 = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

    mockRecord._emitter(TEST_EVENT2);
    jest.runAllTimers();
    jest.advanceTimersByTime(1);
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
