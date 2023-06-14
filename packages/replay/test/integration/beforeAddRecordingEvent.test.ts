import type { EventType } from '@sentry-internal/rrweb';
import * as SentryCore from '@sentry/core';
import type { Transport } from '@sentry/types';
import * as SentryUtils from '@sentry/utils';

import type { Replay } from '../../src';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import * as SendReplayRequest from '../../src/util/sendReplayRequest';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '../index';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

type MockTransportSend = jest.MockedFunction<Transport['send']>;

describe('Integration | beforeAddRecordingEvent', () => {
  let replay: ReplayContainer;
  let integration: Replay;
  let mockTransportSend: MockTransportSend;
  let mockSendReplayRequest: jest.SpyInstance<any>;
  let domHandler: (args: any) => any;
  const { record: mockRecord } = mockRrweb();

  beforeAll(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    jest.spyOn(SentryUtils, 'addInstrumentationHandler').mockImplementation((type, handler: (args: any) => any) => {
      if (type === 'dom') {
        domHandler = handler;
      }
    });

    ({ replay, integration } = await mockSdk({
      replayOptions: {
        beforeAddRecordingEvent: event => {
          const eventData = event.data;

          if (eventData.tag === 'breadcrumb' && eventData.payload.category === 'ui.click') {
            return {
              ...event,
              data: {
                ...eventData,
                payload: {
                  ...eventData.payload,
                  message: 'beforeAddRecordingEvent',
                },
              },
            };
          }

          // This should not do anything because callback should not be called
          // for `event.type != 5` - but we guard anyhow to be safe
          if ((event.type as EventType) === 2) {
            return null;
          }

          if (eventData.tag === 'options') {
            return null;
          }

          return event;
        },
        _experiments: {
          captureExceptions: true,
        },
      },
    }));

    mockSendReplayRequest = jest.spyOn(SendReplayRequest, 'sendReplayRequest');

    jest.runAllTimers();
    mockTransportSend = SentryCore.getCurrentHub()?.getClient()?.getTransport()?.send as MockTransportSend;
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    mockRecord.takeFullSnapshot.mockClear();
    mockTransportSend.mockClear();

    // Create a new session and clear mocks because a segment (from initial
    // checkout) will have already been uploaded by the time the tests run
    clearSession(replay);
    replay['_loadAndCheckSession']();

    mockSendReplayRequest.mockClear();
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    clearSession(replay);
    replay['_loadAndCheckSession']();
  });

  afterAll(() => {
    integration && integration.stop();
  });

  it('changes click breadcrumbs message', async () => {
    domHandler({
      name: 'click',
    });

    await advanceTimers(5000);

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      recordingData: JSON.stringify([
        {
          type: 5,
          timestamp: BASE_TIMESTAMP,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: 'ui.click',
              message: 'beforeAddRecordingEvent',
              data: {},
            },
          },
        },
      ]),
    });
  });

  it('filters out the options event, but *NOT* full snapshot', async () => {
    mockTransportSend.mockClear();
    await integration.stop();

    integration.start();

    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      recordingData: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 }]),
    });
  });
});
