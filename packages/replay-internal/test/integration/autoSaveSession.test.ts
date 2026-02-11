/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import { EventType } from '@sentry-internal/rrweb';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { saveSession } from '../../src/session/saveSession';
import type { RecordingEvent } from '../../src/types';
import { addEvent } from '../../src/util/addEvent';
import { resetSdkMock } from '../mocks/resetSdkMock';

vi.mock('../../src/session/saveSession', () => {
  return {
    saveSession: vi.fn(),
  };
});

describe('Integration | autoSaveSession', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    ['with stickySession=true', true, 1],
    ['with stickySession=false', false, 0],
  ])('%s', async (_: string, stickySession: boolean, addSummand: number) => {
    const { replay } = await resetSdkMock({
      replayOptions: {
        stickySession,
      },
    });

    // Initially called up to three times: once for start, then once for replay.updateSessionActivity & once for segmentId increase
    expect(saveSession).toHaveBeenCalledTimes(addSummand * 3);

    replay['_updateSessionActivity']();

    expect(saveSession).toHaveBeenCalledTimes(addSummand * 4);

    // In order for runFlush to actually do something, we need to add an event
    const event = {
      type: EventType.Custom,
      data: {
        tag: 'test custom',
      },
      timestamp: new Date().valueOf(),
    } as RecordingEvent;

    addEvent(replay, event);

    await Promise.all([replay['_runFlush'](), vi.runAllTimersAsync()]);

    expect(saveSession).toHaveBeenCalledTimes(addSummand * 5);
  });
});
