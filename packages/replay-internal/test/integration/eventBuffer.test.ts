/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WINDOW } from '../../src/constants';
import type { Replay } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import { addEvent } from '../../src/util/addEvent';

// mock functions need to be imported first
import { BASE_TIMESTAMP, mockSdk } from '../index';
import { getTestEventCheckout, getTestEventIncremental } from '../utils/getTestEvent';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | eventBuffer | Event Buffer Max Size', () => {
  let replay: ReplayContainer;
  let integration: Replay;
  const prevLocation = WINDOW.location;

  beforeEach(async () => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));

    ({ replay, integration } = await mockSdk());

    await vi.runAllTimersAsync();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    integration && (await integration.stop());
    Object.defineProperty(WINDOW, 'location', {
      value: prevLocation,
      writable: true,
    });
    vi.clearAllMocks();
  });

  it('does not add replay breadcrumb when stopped due to event buffer limit', async () => {
    const TEST_EVENT = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });

    vi.mock('../../src/constants', async requireActual => ({
      ...(await requireActual<any>()),
      REPLAY_MAX_EVENT_BUFFER_SIZE: 500,
    }));

    await integration.stop();
    integration.startBuffering();

    await addEvent(replay, TEST_EVENT);

    expect(replay.eventBuffer?.hasEvents).toBe(true);
    expect(replay.eventBuffer?.['hasCheckout']).toBe(true);

    // This should should go over max buffer size
    await addEvent(replay, TEST_EVENT);
    // buffer should be cleared and wait for next checkout
    expect(replay.eventBuffer?.hasEvents).toBe(false);
    expect(replay.eventBuffer?.['hasCheckout']).toBe(false);

    await addEvent(replay, TEST_EVENT);
    expect(replay.eventBuffer?.hasEvents).toBe(false);
    expect(replay.eventBuffer?.['hasCheckout']).toBe(false);

    await addEvent(replay, getTestEventCheckout({ timestamp: Date.now() }), true);
    expect(replay.eventBuffer?.hasEvents).toBe(true);
    expect(replay.eventBuffer?.['hasCheckout']).toBe(true);

    vi.resetAllMocks();
  });
});
