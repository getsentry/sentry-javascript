import { captureEvent, withScope } from '@sentry/core';

import { REPLAY_EVENT_NAME } from '@/session/constants';
import { InitialState } from '@/types';
import { addInternalBreadcrumb } from '@/util/addInternalBreadcrumb';

export interface CaptureReplayEventParams {
  /**
   * Initial state of the replay
   */
  initialState: InitialState;
  /**
   * Include a timestamp that should be deemed as the "starting" timestamp of the
   * replay. This usually comes from a `window.performance` entry.
   */
  includeReplayStartTimestamp: boolean;
  /**
   * List of error ids contained in current recording segment
   */
  errorIds: string[];

  /**
   * The current replay id
   */
  replayId: string;
  /**
   * The current recording segment id
   */
  segmentId: number;
  /**
   * Timestamp of the event in milliseconds
   */
  timestamp: number;

  /**
   * List of trace ids contained in current recording segment
   */
  traceIds: string[];
  /**
   * List of URLs visisted in current recording segment
   */
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
  if (segment_id !== 0 && includeReplayStartTimestamp) {
    addInternalBreadcrumb({
      message: `Including replay_start_timestamp on non-initial segment (id: ${segment_id})`,
    });
  }

  withScope((scope) => {
    scope.setTag('replay_sdk_version', __SENTRY_REPLAY_VERSION__);
    captureEvent(
      {
        // @ts-expect-error replay_event is a new event type
        type: REPLAY_EVENT_NAME,
        ...(includeReplayStartTimestamp
          ? { replay_start_timestamp: initialState.timestamp / 1000 }
          : {}),
        timestamp: timestamp / 1000,
        error_ids: errorIds,
        trace_ids: traceIds,
        urls,
        replay_id,
        segment_id,
      },
      { event_id: replay_id }
    );
  });
}
