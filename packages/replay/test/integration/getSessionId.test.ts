import { mockSdk } from '../mocks/mockSdk';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | getSessionId', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('works', async () => {
    const { integration, replay } = await mockSdk({
      replayOptions: {
        stickySession: true,
      },
    });

    expect(integration.getSessionId()).toBeDefined();
    expect(integration.getSessionId()).toEqual(replay.session?.id);

    // When stopped, it is undefined
    integration.stop();

    expect(integration.getSessionId()).toBeUndefined();
  });
});
