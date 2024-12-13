/**
 * @vitest-environment jsdom
 */

import type { MockInstance, MockedFunction } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as SentryBrowserUtils from '@sentry-internal/browser-utils';

import { WINDOW } from '../../src/constants';
import type { Replay } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import { addEvent } from '../../src/util/addEvent';
import { createOptionsEvent } from '../../src/util/handleRecordingEmit';
// mock functions need to be imported first
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '../index';
import { getTestEventIncremental } from '../utils/getTestEvent';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

type MockRunFlush = MockedFunction<ReplayContainer['_runFlush']>;

describe('Integration | stop', () => {
  let replay: ReplayContainer;
  let integration: Replay;
  const prevLocation = WINDOW.location;

  const { record: mockRecord } = mockRrweb();

  let mockAddDomInstrumentationHandler: MockInstance;
  let mockRunFlush: MockRunFlush;

  beforeEach(async () => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    mockAddDomInstrumentationHandler = vi.spyOn(SentryBrowserUtils, 'addClickKeypressInstrumentationHandler');

    ({ replay, integration } = await mockSdk());

    // @ts-expect-error private API
    mockRunFlush = vi.spyOn(replay, '_runFlush');

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

  it('does not upload replay if it was stopped and can resume replays afterwards', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    const ELAPSED = 5000;
    const TEST_EVENT = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });
    const previousSessionId = replay.session?.id;

    // stop replays
    await integration.stop();

    // Pretend 5 seconds have passed
    vi.advanceTimersByTime(ELAPSED);

    addEvent(replay, TEST_EVENT);
    WINDOW.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();
    // Session's does not exist
    expect(replay.session).toEqual(undefined);
    // eventBuffer is destroyed
    expect(replay.eventBuffer).toBe(null);

    // re-enable replay
    integration.start();
    const optionsEvent = createOptionsEvent(replay);

    // will be different session
    expect(replay.session?.id).not.toEqual(previousSessionId);

    vi.advanceTimersByTime(ELAPSED);

    const timestamp = +new Date(BASE_TIMESTAMP + ELAPSED + ELAPSED + ELAPSED) / 1000;

    const hiddenBreadcrumb = {
      type: 5,
      timestamp,
      data: {
        tag: 'breadcrumb',
        payload: {
          timestamp,
          type: 'default',
          category: 'ui.blur',
        },
      },
    };

    addEvent(replay, TEST_EVENT);
    WINDOW.dispatchEvent(new Event('blur'));
    await vi.runAllTimersAsync();
    await new Promise(process.nextTick);
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      recordingData: JSON.stringify([
        // This event happens when we call `replay.start`
        {
          data: { isCheckout: true },
          timestamp: BASE_TIMESTAMP + ELAPSED + ELAPSED,
          type: 2,
        },
        optionsEvent,
        TEST_EVENT,
        hiddenBreadcrumb,
      ]),
    });

    // Session's last activity is last updated when we call `setup()` and *NOT*
    // when tab is blurred
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP + ELAPSED + ELAPSED);
  });

  it('does not buffer new events after being stopped', async function () {
    expect(replay.eventBuffer?.hasEvents).toBe(false);
    expect(mockRunFlush).toHaveBeenCalledTimes(0);
    const TEST_EVENT = getTestEventIncremental({ timestamp: BASE_TIMESTAMP });
    addEvent(replay, TEST_EVENT, true);
    expect(replay.eventBuffer?.hasEvents).toBe(true);
    expect(mockRunFlush).toHaveBeenCalledTimes(0);

    // stop replays
    await integration.stop();

    expect(mockRunFlush).toHaveBeenCalledTimes(1);

    expect(replay.eventBuffer).toBe(null);

    WINDOW.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);

    expect(replay.eventBuffer).toBe(null);
    expect(replay).toHaveLastSentReplay({
      recordingData: JSON.stringify([TEST_EVENT]),
    });
  });

  it('does not call core SDK `addClickKeypressInstrumentationHandler` after initial setup', async function () {
    // NOTE: We clear mockAddDomInstrumentationHandler after every test
    await integration.stop();
    integration.start();
    await integration.stop();
    integration.start();

    expect(mockAddDomInstrumentationHandler).not.toHaveBeenCalled();
  });
});
