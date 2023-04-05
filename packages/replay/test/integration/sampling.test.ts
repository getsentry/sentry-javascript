import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | sampling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing if not sampled', async () => {
    const { mockRecord, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: true,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 0.0,
      },
    });

    // @ts-ignore private API
    const spyAddListeners = jest.spyOn(replay, '_addListeners');
    jest.runAllTimers();

    expect(replay.session).toBe(undefined);

    // This is what the `_context` member is initialized with
    expect(replay.getContext()).toEqual({
      errorIds: new Set(),
      traceIds: new Set(),
      urls: [],
      earliestEvent: null,
      initialTimestamp: expect.any(Number),
      initialUrl: '',
    });
    expect(mockRecord).not.toHaveBeenCalled();
    expect(spyAddListeners).not.toHaveBeenCalled();

    // TODO: Should we initialize recordingMode to something else?
    expect(replay.recordingMode).toBe('session');
  });

  it('samples for error based session', async () => {
    const { mockRecord, replay, integration } = await resetSdkMock({
      replayOptions: {
        stickySession: true,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
      autoStart: false, // Needs to be false in order to spy on replay
    });

    // @ts-ignore private API
    const spyAddListeners = jest.spyOn(replay, '_addListeners');

    // @ts-ignore protected
    integration._initialize();

    jest.runAllTimers();

    expect(replay.session?.id).toBeDefined();

    // This is what the `_context` member is initialized with
    expect(replay.getContext()).toEqual({
      errorIds: new Set(),
      earliestEvent: expect.any(Number),
      initialTimestamp: expect.any(Number),
      initialUrl: 'http://localhost/',
      traceIds: new Set(),
      urls: ['http://localhost/'],
    });
    expect(replay.recordingMode).toBe('error');
    expect(spyAddListeners).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });
});
