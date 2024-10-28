/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, test } from 'vitest';
import type { Replay } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | getRecordingMode()', () => {
  let replay: ReplayContainer;
  let integration: Replay;

  beforeEach(async () => {
    ({ replay, integration } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
      },
    }));
  });

  test('returns "session" when session sampling is enabled', async () => {
    expect(integration.getRecordingMode()).toBe('session');
  });

  test('returns "buffer" when buffering is enabled', async () => {
    replay.stop();
    replay.startBuffering();
    expect(integration.getRecordingMode()).toBe('buffer');
  });

  test('returns undefined when replay is stopped', async () => {
    replay.stop();
    expect(integration.getRecordingMode()).toBeUndefined();
  });
});
