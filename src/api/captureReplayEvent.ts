import { captureEvent } from '@sentry/core';

import { REPLAY_EVENT_NAME } from '@/session/constants';
import { InitialState } from '@/types';

export interface CaptureReplayEventParams {
  initialState: InitialState;
  includeReplayStartTimestamp: boolean;
  errorIds: string[];
  replayId: string;
  segmentId: number;
  /**
   * Timestamp of the event in milliseconds
   */
  timestamp: number;
  traceIds: string[];
  urls: string[];
}

export function captureReplayEvent({
  initialState,
  includeReplayStartTimestamp,
  errorIds,
  replayId: replay_id,
  segmentId: segment_id,
  timestamp,
  traceIds,
  urls,
}: CaptureReplayEventParams) {
  captureEvent(
    {
      // @ts-expect-error replay_event is a new event type
      type: REPLAY_EVENT_NAME,
      ...(includeReplayStartTimestamp
        ? { replay_start_timestamp: initialState.timestamp / 1000 }
        : {}),
      ...(timestamp ? { timestamp: timestamp / 1000 } : {}),
      error_ids: errorIds,
      trace_ids: traceIds,
      urls,
      replay_id,
      segment_id,
    },
    { event_id: replay_id }
  );
}
