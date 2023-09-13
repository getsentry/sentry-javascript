import type { ReplayEvent } from '@sentry/types';
import { makeDsn } from '@sentry/utils';

import { createReplayEnvelope } from '../../../src/util/createReplayEnvelope';

describe('Unit | util | createReplayEnvelope', () => {
  const REPLAY_ID = 'MY_REPLAY_ID';

  const replayEvent: ReplayEvent = {
    type: 'replay_event',
    timestamp: 1670837008.634,
    error_ids: ['errorId'],
    trace_ids: ['traceId'],
    urls: ['https://example.com'],
    replay_id: REPLAY_ID,
    segment_id: 3,
    platform: 'javascript',
    event_id: REPLAY_ID,
    environment: 'production',
    sdk: {
      integrations: ['BrowserTracing', 'Replay'],
      name: 'sentry.javascript.unknown',
      version: '7.25.0',
    },
    replay_type: 'buffer',
    contexts: {
      replay: {
        error_sample_rate: 0,
        session_sample_rate: 1,
      },
    },
    tags: {},
  };

  const payloadWithSequence = 'payload';

  const dsn = makeDsn({
    host: 'sentry.io',
    pass: 'xyz',
    port: '1234',
    projectId: '123',
    protocol: 'https',
    publicKey: 'abc',
  })!;

  it('creates an envelope for a given Replay event', () => {
    const envelope = createReplayEnvelope(replayEvent, payloadWithSequence, dsn);

    expect(envelope).toEqual([
      {
        event_id: REPLAY_ID,
        sdk: { name: 'sentry.javascript.unknown', version: '7.25.0' },
        sent_at: expect.any(String),
      },
      [
        [
          { type: 'replay_event' },
          {
            contexts: {
              replay: {
                error_sample_rate: 0,
                session_sample_rate: 1,
              },
            },
            environment: 'production',
            error_ids: ['errorId'],
            event_id: REPLAY_ID,
            platform: 'javascript',
            replay_id: REPLAY_ID,
            replay_type: 'buffer',
            sdk: { integrations: ['BrowserTracing', 'Replay'], name: 'sentry.javascript.unknown', version: '7.25.0' },
            segment_id: 3,
            tags: {},
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

  it('creates an envelope with the `dsn` key in the header if `tunnel` is specified', () => {
    const envelope = createReplayEnvelope(replayEvent, payloadWithSequence, dsn, '/my-tunnel-endpoint');

    expect(envelope).toEqual([
      {
        event_id: REPLAY_ID,
        sdk: { name: 'sentry.javascript.unknown', version: '7.25.0' },
        sent_at: expect.any(String),
        dsn: 'https://abc@sentry.io:1234/123',
      },
      [
        [
          { type: 'replay_event' },
          {
            contexts: {
              replay: {
                error_sample_rate: 0,
                session_sample_rate: 1,
              },
            },
            environment: 'production',
            error_ids: ['errorId'],
            event_id: REPLAY_ID,
            platform: 'javascript',
            replay_id: REPLAY_ID,
            sdk: { integrations: ['BrowserTracing', 'Replay'], name: 'sentry.javascript.unknown', version: '7.25.0' },
            segment_id: 3,
            replay_type: 'buffer',
            tags: {},
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
