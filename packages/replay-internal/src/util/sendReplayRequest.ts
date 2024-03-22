import { getClient, getCurrentScope } from '@sentry/core';
import type { ReplayEvent, TransportMakeRequestResponse } from '@sentry/types';
import type { RateLimits } from '@sentry/utils';
import { resolvedSyncPromise } from '@sentry/utils';
import { isRateLimited, updateRateLimits } from '@sentry/utils';

import { REPLAY_EVENT_NAME, UNABLE_TO_SEND_REPLAY } from '../constants';
import type { SendReplayData } from '../types';
import { createReplayEnvelope } from './createReplayEnvelope';
import { logInfo } from './log';
import { prepareRecordingData } from './prepareRecordingData';
import { prepareReplayEvent } from './prepareReplayEvent';

/**
 * Send replay attachment using `fetch()`
 */
export async function sendReplayRequest({
  recordingData,
  replayId,
  segmentId: segment_id,
  eventContext,
  timestamp,
  session,
}: SendReplayData): Promise<TransportMakeRequestResponse> {
  const preparedRecordingData = prepareRecordingData({
    recordingData,
    headers: {
      segment_id,
    },
  });

  const { urls, errorIds, traceIds, initialTimestamp } = eventContext;

  const client = getClient();
  const scope = getCurrentScope();
  const transport = client && client.getTransport();
  const dsn = client && client.getDsn();

  if (!client || !transport || !dsn || !session.sampled) {
    return resolvedSyncPromise({});
  }

  const baseEvent: ReplayEvent = {
    type: REPLAY_EVENT_NAME,
    replay_start_timestamp: initialTimestamp / 1000,
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
    client.recordDroppedEvent('event_processor', 'replay', baseEvent);
    logInfo('An event processor returned `null`, will not send event.');
    return resolvedSyncPromise({});
  }

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
      "contexts": {
      },
  }
  */

  // Prevent this data (which, if it exists, was used in earlier steps in the processing pipeline) from being sent to
  // sentry. (Note: Our use of this property comes and goes with whatever we might be debugging, whatever hacks we may
  // have temporarily added, etc. Even if we don't happen to be using it at some point in the future, let's not get rid
  // of this `delete`, lest we miss putting it back in the next time the property is in use.)
  delete replayEvent.sdkProcessingMetadata;

  const envelope = createReplayEnvelope(replayEvent, preparedRecordingData, dsn, client.getOptions().tunnel);

  let response: TransportMakeRequestResponse;

  try {
    response = await transport.send(envelope);
  } catch (err) {
    const error = new Error(UNABLE_TO_SEND_REPLAY);

    try {
      // In case browsers don't allow this property to be writable
      // @ts-expect-error This needs lib es2022 and newer
      error.cause = err;
    } catch {
      // nothing to do
    }
    throw error;
  }

  // If the status code is invalid, we want to immediately stop & not retry
  if (typeof response.statusCode === 'number' && (response.statusCode < 200 || response.statusCode >= 300)) {
    throw new TransportStatusCodeError(response.statusCode);
  }

  const rateLimits = updateRateLimits({}, response);
  if (isRateLimited(rateLimits, 'replay')) {
    throw new RateLimitError(rateLimits);
  }

  return response;
}

/**
 * This error indicates that the transport returned an invalid status code.
 */
export class TransportStatusCodeError extends Error {
  public constructor(statusCode: number) {
    super(`Transport returned status code ${statusCode}`);
  }
}

/**
 * This error indicates that we hit a rate limit API error.
 */
export class RateLimitError extends Error {
  public rateLimits: RateLimits;

  public constructor(rateLimits: RateLimits) {
    super('Rate limit hit');
    this.rateLimits = rateLimits;
  }
}
