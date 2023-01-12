import { getCurrentHub } from '@sentry/core';
import type { ReplayEvent, TransportMakeRequestResponse } from '@sentry/types';
import { logger } from '@sentry/utils';

import { REPLAY_EVENT_NAME, UNABLE_TO_SEND_REPLAY } from '../constants';
import type { SendReplay } from '../types';
import { createRecordingData } from './createRecordingData';
import { createReplayEnvelope } from './createReplayEnvelope';
import { prepareReplayEvent } from './prepareReplayEvent';

/**
 * Send replay attachment using `fetch()`
 */
export async function sendReplayRequest({
  events,
  replayId,
  segmentId: segment_id,
  includeReplayStartTimestamp,
  eventContext,
  timestamp,
  session,
  options,
}: SendReplay): Promise<void | TransportMakeRequestResponse> {
  const recordingData = createRecordingData({
    events,
    headers: {
      segment_id,
    },
  });

  const { urls, errorIds, traceIds, initialTimestamp } = eventContext;

  const hub = getCurrentHub();
  const client = hub.getClient();
  const scope = hub.getScope();
  const transport = client && client.getTransport();
  const dsn = client?.getDsn();

  if (!client || !scope || !transport || !dsn || !session.sampled) {
    return;
  }

  const baseEvent: ReplayEvent = {
    // @ts-ignore private api
    type: REPLAY_EVENT_NAME,
    ...(includeReplayStartTimestamp ? { replay_start_timestamp: initialTimestamp / 1000 } : {}),
    timestamp: timestamp / 1000,
    error_ids: errorIds,
    trace_ids: traceIds,
    urls,
    replay_id: replayId,
    segment_id,
    replay_type: session.sampled,
  };

  const replayEvent = await prepareReplayEvent({ scope, client, replayId, event: baseEvent });

  if (!replayEvent) {
    // Taken from baseclient's `_processEvent` method, where this is handled for errors/transactions
    client.recordDroppedEvent('event_processor', 'replay_event', baseEvent);
    __DEBUG_BUILD__ && logger.log('An event processor returned `null`, will not send event.');
    return;
  }

  replayEvent.tags = {
    ...replayEvent.tags,
    sessionSampleRate: options.sessionSampleRate,
    errorSampleRate: options.errorSampleRate,
  };

  /*
  For reference, the fully built event looks something like this:
  {
      "type": "replay_event",
      "timestamp": 1670837008.634,
      "error_ids": [
          "errorId"
      ],
      "trace_ids": [
          "traceId"
      ],
      "urls": [
          "https://example.com"
      ],
      "replay_id": "eventId",
      "segment_id": 3,
      "replay_type": "error",
      "platform": "javascript",
      "event_id": "eventId",
      "environment": "production",
      "sdk": {
          "integrations": [
              "BrowserTracing",
              "Replay"
          ],
          "name": "sentry.javascript.browser",
          "version": "7.25.0"
      },
      "sdkProcessingMetadata": {},
      "tags": {
          "sessionSampleRate": 1,
          "errorSampleRate": 0,
      }
  }
  */

  const envelope = createReplayEnvelope(replayEvent, recordingData, dsn, client.getOptions().tunnel);

  try {
    return await transport.send(envelope);
  } catch {
    throw new Error(UNABLE_TO_SEND_REPLAY);
  }
}
