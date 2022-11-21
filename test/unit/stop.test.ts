import * as SentryUtils from '@sentry/utils';
// mock functions need to be imported first
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '@test';

import { Replay } from './../../src';
import { SESSION_IDLE_DURATION } from './../../src/session/constants';
import { useFakeTimers } from './../utils/use-fake-timers';

useFakeTimers();

describe('Replay - stop', () => {
  let replay: Replay;
  const prevLocation = window.location;

  type MockAddInstrumentationHandler = jest.MockedFunction<typeof SentryUtils.addInstrumentationHandler>;
  const { record: mockRecord } = mockRrweb();

  let mockAddInstrumentationHandler: MockAddInstrumentationHandler;

  beforeAll(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    mockAddInstrumentationHandler = jest.spyOn(
      SentryUtils,
      'addInstrumentationHandler',
    ) as MockAddInstrumentationHandler;

    ({ replay } = await mockSdk());
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
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
    mockAddInstrumentationHandler.mockClear();
    // @ts-ignore: The operand of a 'delete' operator must be optional.ts(2790)
    delete window.location;
    Object.defineProperty(window, 'location', {
      value: prevLocation,
      writable: true,
    });
  });

  afterAll(() => {
    replay && replay.stop();
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
    replay.stop();

    // Pretend 5 seconds have passed
    jest.advanceTimersByTime(ELAPSED);

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveSentReplay();
    // Session's last activity should not be updated
    expect(replay.session?.lastActivity).toEqual(BASE_TIMESTAMP);
    // eventBuffer is destroyed
    expect(replay.eventBuffer).toBe(null);

    // re-enable replay
    replay.start();

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

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).toHaveSentReplay({
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
    window.dispatchEvent(new Event('blur'));
    expect(replay.eventBuffer?.length).toBe(1);

    // stop replays
    replay.stop();

    expect(replay.eventBuffer?.length).toBe(undefined);

    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);

    expect(replay.eventBuffer?.length).toBe(undefined);
    expect(replay).not.toHaveSentReplay();
  });

  it('does not call core SDK `addInstrumentationHandler` after initial setup', async function () {
    // NOTE: We clear addInstrumentationHandler mock after every test
    replay.stop();
    replay.start();
    replay.stop();
    replay.start();

    expect(mockAddInstrumentationHandler).not.toHaveBeenCalled();
  });
});
