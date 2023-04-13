import { mockSdk } from '../mocks/mockSdk';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | getReplayId', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('works', async () => {
    const { integration, replay } = await mockSdk({
      replayOptions: {
        stickySession: true,
      },
    });

    expect(integration.getReplayId()).toBeDefined();
    expect(integration.getReplayId()).toEqual(replay.session?.id);

    // When stopped, it is undefined
    integration.stop();

    expect(integration.getReplayId()).toBeUndefined();
  });
});
