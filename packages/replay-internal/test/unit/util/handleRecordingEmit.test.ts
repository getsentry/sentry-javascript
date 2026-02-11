/**
 * @vitest-environment jsdom
 */

import '../../utils/mock-internal-setTimeout';
import { EventType } from '@sentry-internal/rrweb';
import type { MockInstance } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayOptionFrameEvent } from '../../../src/types';
import * as SentryAddEvent from '../../../src/util/addEvent';
import { createOptionsEvent, getHandleRecordingEmit } from '../../../src/util/handleRecordingEmit';
import { BASE_TIMESTAMP } from '../..';
import { setupReplayContainer } from '../../utils/setupReplayContainer';

let optionsEvent: ReplayOptionFrameEvent;

describe('Unit | util | handleRecordingEmit', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  let addEventMock: MockInstance;

  beforeEach(function () {
    vi.setSystemTime(BASE_TIMESTAMP);
    addEventMock = vi.spyOn(SentryAddEvent, 'addEventSync').mockImplementation(() => {
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

    expect(addEventMock).toBeCalledTimes(2);
    expect(addEventMock).toHaveBeenNthCalledWith(1, replay, event, true);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, optionsEvent, false);

    handler(event);

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

    // Called twice, once for event and once for settings on checkout only
    expect(addEventMock).toBeCalledTimes(2);
    expect(addEventMock).toHaveBeenNthCalledWith(1, replay, event, true);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, optionsEvent, false);

    handler(event, true);

    expect(addEventMock).toBeCalledTimes(4);
    expect(addEventMock).toHaveBeenNthCalledWith(3, replay, event, true);
    expect(addEventMock).toHaveBeenLastCalledWith(replay, { ...optionsEvent, timestamp: BASE_TIMESTAMP }, false);
  });
});
