/**
 * @vitest-environment jsdom
 */

import '../../utils/mock-internal-setTimeout';
import { EventType, IncrementalSource, record } from '@sentry-internal/rrweb';
import { NodeType, type serializedElementNodeWithId } from '@sentry-internal/rrweb-snapshot';
import type { MockInstance } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleDom } from '../../../src/coreHandlers/handleDom';
import type { ReplayOptionFrameEvent } from '../../../src/types';
import * as SentryAddEvent from '../../../src/util/addEvent';
import {
  createOptionsEvent,
  getHandleRecordingEmit,
  syncMirrorAttributesFromMutationEvent,
} from '../../../src/util/handleRecordingEmit';
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
    vi.restoreAllMocks();
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

  it('syncs mirror attributes from mutation events', function () {
    const target = document.createElement('button');
    target.textContent = 'Save Note';

    const meta = {
      id: 42,
      type: NodeType.Element,
      tagName: 'button',
      childNodes: [{ id: 43, type: NodeType.Text, textContent: 'Save Note' }],
      attributes: {
        id: 'next-question-button',
        'data-testid': 'next-question-button',
      },
    };

    vi.spyOn(record.mirror, 'getNode').mockReturnValue(target);
    vi.spyOn(record.mirror, 'getMeta').mockReturnValue(meta as serializedElementNodeWithId);
    vi.spyOn(record.mirror, 'getId').mockReturnValue(42);

    syncMirrorAttributesFromMutationEvent({
      type: EventType.IncrementalSnapshot,
      timestamp: BASE_TIMESTAMP + 10,
      data: {
        source: IncrementalSource.Mutation,
        texts: [],
        attributes: [
          {
            id: 42,
            attributes: {
              id: 'save-note-button',
              'data-testid': 'save-note-button',
            },
          },
        ],
        removes: [],
        adds: [],
      },
    });

    expect(
      handleDom({
        name: 'click',
        event: { target },
      }),
    ).toEqual({
      category: 'ui.click',
      data: {
        nodeId: 42,
        node: {
          id: 42,
          tagName: 'button',
          textContent: 'Save Note',
          attributes: {
            id: 'save-note-button',
            testId: 'save-note-button',
          },
        },
      },
      message: 'button',
      timestamp: expect.any(Number),
      type: 'default',
    });
  });

  it('preserves masked mutation attribute values', function () {
    const target = document.createElement('button');

    const meta = {
      id: 42,
      type: NodeType.Element,
      tagName: 'button',
      childNodes: [],
      attributes: {
        'aria-label': 'Save Note',
      },
    };

    vi.spyOn(record.mirror, 'getNode').mockReturnValue(target);
    vi.spyOn(record.mirror, 'getMeta').mockReturnValue(meta as serializedElementNodeWithId);

    syncMirrorAttributesFromMutationEvent({
      type: EventType.IncrementalSnapshot,
      timestamp: BASE_TIMESTAMP + 10,
      data: {
        source: IncrementalSource.Mutation,
        texts: [],
        attributes: [
          {
            id: 42,
            attributes: {
              'aria-label': '*********',
            },
          },
        ],
        removes: [],
        adds: [],
      },
    });

    expect(meta.attributes['aria-label']).toBe('*********');
  });
});
