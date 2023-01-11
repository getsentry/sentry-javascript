import * as SentryUtils from '@sentry/utils';

import type { Replay } from '../../src';
import { SESSION_IDLE_DURATION, WINDOW } from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { addEvent } from '../../src/util/addEvent';
// mock functions need to be imported first
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '../index';
import { clearSession } from '../utils/clearSession';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | stop', () => {
  let replay: ReplayContainer;
  let integration: Replay;
  const prevLocation = WINDOW.location;

  type MockAddInstrumentationHandler = jest.MockedFunction<typeof SentryUtils.addInstrumentationHandler>;
  const { record: mockRecord } = mockRrweb();

  let mockAddInstrumentationHandler: MockAddInstrumentationHandler;

  beforeAll(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    mockAddInstrumentationHandler = jest.spyOn(
      SentryUtils,
      'addInstrumentationHandler',
    ) as MockAddInstrumentationHandler;

    ({ replay, integration } = await mockSdk());
    jest.runAllTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    replay.eventBuffer?.destroy();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    sessionStorage.clear();
    clearSession(replay);
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
    mockAddInstrumentationHandler.mockClear();
    Object.defineProperty(WINDOW, 'location', {
      value: prevLocation,
      writable: true,
    });
  });

  afterAll(() => {
    integration && integration.stop();
  });

  it('does not upload replay if it was stopped and can resume replays afterwards', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    const ELAPSED = 5000;
    // Not sure where the 20ms comes from tbh
    const EXTRA_TICKS = 20;
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

    // stop replays
    integration.stop();

    // Pretend 5 seconds have passed
    jest.advanceTimersByTime(ELAPSED);

    addEvent(replay, TEST_EVENT);
    WINDOW.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();
    // Session's last activity should not be updated
    expect(replay.session?.lastActivity).toEqual(BASE_TIMESTAMP);
    // eventBuffer is destroyed
    expect(replay.eventBuffer).toBe(null);

    // re-enable replay
    integration.start();

    jest.advanceTimersByTime(ELAPSED);

    const timestamp = +new Date(BASE_TIMESTAMP + ELAPSED + ELAPSED + EXTRA_TICKS) / 1000;

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
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).toHaveLastSentReplay({
      events: JSON.stringify([
        // This event happens when we call `replay.start`
        {
          data: { isCheckout: true },
          timestamp: BASE_TIMESTAMP + ELAPSED + EXTRA_TICKS,
          type: 2,
        },
        TEST_EVENT,
        hiddenBreadcrumb,
      ]),
    });
    // Session's last activity is last updated when we call `setup()` and *NOT*
    // when tab is blurred
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP + ELAPSED + 20);
  });

  it('does not buffer events when stopped', async function () {
    WINDOW.dispatchEvent(new Event('blur'));
    expect(replay.eventBuffer?.pendingLength).toBe(1);

    // stop replays
    integration.stop();

    expect(replay.eventBuffer?.pendingLength).toBe(undefined);

    WINDOW.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);

    expect(replay.eventBuffer?.pendingLength).toBe(undefined);
    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not call core SDK `addInstrumentationHandler` after initial setup', async function () {
    // NOTE: We clear addInstrumentationHandler mock after every test
    integration.stop();
    integration.start();
    integration.stop();
    integration.start();

    expect(mockAddInstrumentationHandler).not.toHaveBeenCalled();
  });
});
