// mock functions need to be imported first
import { mockRrweb, mockSdk } from '../index';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Replay (sampling)', () => {
  it('does nothing if not sampled', async () => {
    const { record: mockRecord } = mockRrweb();
    const { replay } = await mockSdk({
      replayOptions: {
        stickySession: true,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 0.0,
      },
    });

    jest.spyOn(replay, 'loadSession');
    jest.spyOn(replay, 'addListeners');
    // @ts-ignore private
    expect(replay.initialState).toEqual(undefined);
    jest.runAllTimers();

    expect(replay.session?.sampled).toBe(false);
    // @ts-ignore private
    expect(replay._context).toEqual(
      expect.objectContaining({
        initialTimestamp: expect.any(Number),
        initialUrl: 'http://localhost/',
      }),
    );
    expect(mockRecord).not.toHaveBeenCalled();
    expect(replay.addListeners).not.toHaveBeenCalled();
  });
});
