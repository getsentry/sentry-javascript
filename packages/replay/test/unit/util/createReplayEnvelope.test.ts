import { Event } from '@sentry/types';

import { createReplayEnvelope } from '../../../src/util/createReplayEnvelope';

describe('createReplayEnvelope', () => {
  it('creates an envelope for a given Replay event', () => {
    const replayId = '1234';
    const replayEvent = {
      type: 'replay_event',
      timestamp: 1670837008.634,
      error_ids: ['errorId'],
      trace_ids: ['traceId'],
      urls: ['https://example.com'],
      replay_id: 'eventId',
      segment_id: 3,
      platform: 'javascript',
      event_id: 'eventId',
      environment: 'production',
      sdk: {
        integrations: ['BrowserTracing', 'Replay'],
        name: 'sentry.javascript.browser',
        version: '7.25.0',
      },
      tags: {
        sessionSampleRate: 1,
        errorSampleRate: 0,
        replayType: 'error',
      },
    };
    const payloadWithSequence = 'payload';

    const envelope = createReplayEnvelope(replayId, replayEvent as Event, payloadWithSequence);

    expect(envelope).toEqual([
      {
        event_id: '1234',
        sdk: { name: 'sentry.javascript.browser', version: '7.25.0' },
        sent_at: expect.any(String),
      },
      [
        [
          { type: 'replay_event' },
          {
            environment: 'production',
            error_ids: ['errorId'],
            event_id: 'eventId',
            platform: 'javascript',
            replay_id: 'eventId',
            sdk: { integrations: ['BrowserTracing', 'Replay'], name: 'sentry.javascript.browser', version: '7.25.0' },
            segment_id: 3,
            tags: { errorSampleRate: 0, replayType: 'error', sessionSampleRate: 1 },
            timestamp: 1670837008.634,
            trace_ids: ['traceId'],
            type: 'replay_event',
            urls: ['https://example.com'],
          },
        ],
        [{ length: 7, type: 'replay_recording' }, 'payload'],
      ],
    ]);
  });
});
