import { describe, expect, it, jest } from '@jest/globals';

jest.unmock('@sentry/browser');

// mock functions need to be imported first
import { mockRrweb, mockSdk } from '@test';

jest.useFakeTimers({ advanceTimers: true });

describe('Replay (sampling)', () => {
  it('does nothing if not sampled', async () => {
    const { record: mockRecord } = mockRrweb();
    const { replay } = await mockSdk({
      replayOptions: {
        stickySession: true,
        sessionSampleRate: 0.0,
        errorSampleRate: 0.0,
      },
    });

    jest.spyOn(replay, 'loadSession');
    jest.spyOn(replay, 'addListeners');
    // @ts-expect-error private
    expect(replay.initialState).toEqual(undefined);
    jest.runAllTimers();

    expect(replay.session?.sampled).toBe(false);
    // @ts-expect-error private
    expect(replay.initialState).toEqual({
      timestamp: expect.any(Number),
      url: 'http://localhost/',
    });
    expect(mockRecord).not.toHaveBeenCalled();
    expect(replay.addListeners).not.toHaveBeenCalled();
  });
});
