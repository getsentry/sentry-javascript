import { EventType } from '@sentry-internal/rrweb';

import { BASE_TIMESTAMP } from '../..';
import type { ReplayOptionFrameEvent } from '../../../src/types';
import * as SentryAddEvent from '../../../src/util/addEvent';
import { createOptionsEvent, getHandleRecordingEmit } from '../../../src/util/handleRecordingEmit';
import { setupReplayContainer } from '../../utils/setupReplayContainer';
import { useFakeTimers } from '../../utils/use-fake-timers';

useFakeTimers();

let optionsEvent: ReplayOptionFrameEvent;

describe('Unit | util | handleRecordingEmit', () => {
  let addEventMock: jest.SpyInstance;

  beforeEach(function () {
    jest.setSystemTime(BASE_TIMESTAMP);
    addEventMock = jest.spyOn(SentryAddEvent, 'addEventSync').mockImplementation(() => {
      return true;
    });
  });

  afterEach(function () {
    addEventMock.mockReset();
  });

  it('interprets first event as checkout event', async function () {
    const replay = setupReplayContainer({
      options: {
        errorSampleRate: 0,
        sessionSampleRate: 1,
      },
    });
    optionsEvent = createOptionsEvent(replay);

    const handler = getHandleRecordingEmit(replay);

    const event = {
      type: EventType.FullSnapshot,
      data: {
        tag: 'test custom',
      },
      timestamp: BASE_TIMESTAMP + 10,
    };

    handler(event);
    await new Promise(process.nextTick);

    expect(addEventMock).toBeCalledTimes(2);
    expect(addEventMock).toHaveBeenNthCalledWith(1, replay, event, true);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, optionsEvent, false);

    handler(event);
    await new Promise(process.nextTick);

    expect(addEventMock).toBeCalledTimes(3);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, event, false);
  });

  it('interprets any event with isCheckout as checkout', async function () {
    const replay = setupReplayContainer({
      options: {
        errorSampleRate: 0,
        sessionSampleRate: 1,
      },
    });
    optionsEvent = createOptionsEvent(replay);

    const handler = getHandleRecordingEmit(replay);

    const event = {
      type: EventType.IncrementalSnapshot,
      data: {
        tag: 'test custom',
      },
      timestamp: BASE_TIMESTAMP + 10,
    };

    handler(event, true);
    await new Promise(process.nextTick);

    // Called twice, once for event and once for settings on checkout only
    expect(addEventMock).toBeCalledTimes(2);
    expect(addEventMock).toHaveBeenNthCalledWith(1, replay, event, true);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, optionsEvent, false);

    handler(event, true);
    await new Promise(process.nextTick);

    expect(addEventMock).toBeCalledTimes(4);
    expect(addEventMock).toHaveBeenNthCalledWith(3, replay, event, true);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, { ...optionsEvent, timestamp: BASE_TIMESTAMP + 20 }, false);
  });
});
