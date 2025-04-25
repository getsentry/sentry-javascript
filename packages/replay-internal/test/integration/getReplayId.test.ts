/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockSdk } from '../mocks/mockSdk';

describe('Integration | getReplayId', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
