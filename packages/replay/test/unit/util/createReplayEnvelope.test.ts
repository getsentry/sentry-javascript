import type { ReplayEvent } from '@sentry/types';
import { makeDsn } from '@sentry/utils';
import { TextEncoder } from 'util';

import { createReplayEnvelope } from '../../../src/util/createReplayEnvelope';

describe('Unit | util | createReplayEnvelope', () => {
  const REPLAY_ID = 'MY_REPLAY_ID';

  const replayEvent: ReplayEvent = {
    // @ts-ignore private api
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
    replay_type: 'error',
    tags: {
      sessionSampleRate: 1,
      errorSampleRate: 0,
    },
  };

  const payloadWithSequence = 'payload';

  const dsn = makeDsn({
    host: 'sentry.io',
    pass: 'xyz',
    port: '1234',
    projectId: '123',
    protocol: 'https',
    publicKey: 'abc',
  });

  beforeAll(() => {
    (global as any).TextEncoder = TextEncoder;
  });

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
            environment: 'production',
            error_ids: ['errorId'],
            event_id: REPLAY_ID,
            platform: 'javascript',
            replay_id: REPLAY_ID,
            replay_type: 'error',
            sdk: { integrations: ['BrowserTracing', 'Replay'], name: 'sentry.javascript.unknown', version: '7.25.0' },
            segment_id: 3,
            tags: { errorSampleRate: 0, sessionSampleRate: 1 },
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
            environment: 'production',
            error_ids: ['errorId'],
            event_id: REPLAY_ID,
            platform: 'javascript',
            replay_id: REPLAY_ID,
            sdk: { integrations: ['BrowserTracing', 'Replay'], name: 'sentry.javascript.unknown', version: '7.25.0' },
            segment_id: 3,
            replay_type: 'error',
            tags: { errorSampleRate: 0, sessionSampleRate: 1 },
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
