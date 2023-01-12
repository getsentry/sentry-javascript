import { EventType } from 'rrweb';

import type { RecordingEvent } from '../../src/types';
import { addEvent } from '../../src/util/addEvent';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | autoSaveSession', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['with stickySession=true', true, 1],
    ['with stickySession=false', false, 0],
  ])('%s', async (_: string, stickySession: boolean, addSummand: number) => {
    let saveSessionSpy;

    jest.mock('../../src/session/saveSession', () => {
      saveSessionSpy = jest.fn();

      return {
        saveSession: saveSessionSpy,
      };
    });

    const { replay } = await resetSdkMock({
      replayOptions: {
        stickySession,
      },
    });

    // Initially called up to three times: once for start, then once for replay.updateSessionActivity & once for segmentId increase
    expect(saveSessionSpy).toHaveBeenCalledTimes(addSummand * 3);

    replay.updateSessionActivity();

    expect(saveSessionSpy).toHaveBeenCalledTimes(addSummand * 4);

    // In order for runFlush to actually do something, we need to add an event
    const event = {
      type: EventType.Custom,
      data: {
        tag: 'test custom',
      },
      timestamp: new Date().valueOf(),
    } as RecordingEvent;

    addEvent(replay, event);

    await replay.runFlush();

    expect(saveSessionSpy).toHaveBeenCalledTimes(addSummand * 5);
  });
});
