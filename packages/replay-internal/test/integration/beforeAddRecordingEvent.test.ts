/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import type { Transport } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import * as SentryBrowserUtils from '@sentry-internal/browser-utils';
import type { MockedFunction, MockInstance } from 'vitest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Replay } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import { createPerformanceEntries } from '../../src/util/createPerformanceEntries';
import { createPerformanceSpans } from '../../src/util/createPerformanceSpans';
import * as SendReplayRequest from '../../src/util/sendReplayRequest';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '../index';
import type { DomHandler } from '../types';

type MockTransportSend = MockedFunction<Transport['send']>;

describe('Integration | beforeAddRecordingEvent', () => {
  let replay: ReplayContainer;
  let integration: Replay;
  let mockTransportSend: MockTransportSend;
  let mockSendReplayRequest: MockInstance<any>;
  let domHandler: DomHandler;
  const { record: mockRecord } = mockRrweb();

  beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    vi.spyOn(SentryBrowserUtils, 'addClickKeypressInstrumentationHandler').mockImplementation(handler => {
      domHandler = handler;
    });

    ({ replay, integration } = await mockSdk({
      replayOptions: {
        beforeAddRecordingEvent: event => {
          const eventData = event.data;

          if (eventData.tag === 'performanceSpan') {
            throw new Error('test error in callback');
          }

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

    mockSendReplayRequest = vi.spyOn(SendReplayRequest, 'sendReplayRequest');

    vi.runAllTimers();
    mockTransportSend = SentryCore.getClient()?.getTransport()?.send as MockTransportSend;
  });

  beforeEach(() => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    mockRecord.takeFullSnapshot.mockClear();
    mockTransportSend.mockClear();

    // Create a new session and clear mocks because a segment (from initial
    // checkout) will have already been uploaded by the time the tests run
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    mockSendReplayRequest.mockClear();
  });

  afterEach(async () => {
    vi.runAllTimers();
    await new Promise(process.nextTick);
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    clearSession(replay);
  });

  afterAll(() => {
    integration?.stop();
  });

  it('changes click breadcrumbs message', async () => {
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    await vi.runAllTimersAsync();

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

    await vi.runAllTimersAsync();
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      recordingData: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 }]),
    });
  });

  it('handles error in callback', async () => {
    createPerformanceSpans(
      replay,
      createPerformanceEntries([
        {
          name: 'https://sentry.io/foo.js',
          entryType: 'resource',
          startTime: 176.59999990463257,
          duration: 5.600000023841858,
          initiatorType: 'link',
          nextHopProtocol: 'h2',
          workerStart: 177.5,
          redirectStart: 0,
          redirectEnd: 0,
          fetchStart: 177.69999992847443,
          domainLookupStart: 177.69999992847443,
          domainLookupEnd: 177.69999992847443,
          connectStart: 177.69999992847443,
          connectEnd: 177.69999992847443,
          secureConnectionStart: 177.69999992847443,
          requestStart: 177.5,
          responseStart: 181,
          responseEnd: 182.19999992847443,
          transferSize: 0,
          encodedBodySize: 0,
          decodedBodySize: 0,
          serverTiming: [],
        } as unknown as PerformanceResourceTiming,
      ]),
    );

    await vi.runAllTimersAsync();

    expect(replay).not.toHaveLastSentReplay();
    expect(replay.isEnabled()).toBe(true);
  });
});
