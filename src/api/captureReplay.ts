import { captureEvent } from '@sentry/core';

import { ROOT_REPLAY_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';
import { InitialState } from '@/types';

export interface CaptureReplayParams {
  session: Session;
  initialState: InitialState;
  errorIds: string[];
  traceIds: string[];
  urls: string[];
}

export function captureReplay({
  session,
  initialState,
  errorIds,
  traceIds,
  urls,
}: CaptureReplayParams) {
  captureEvent(
    {
      message: ROOT_REPLAY_NAME,
      tags: { segmentId: session.segmentId, url: initialState.url },
      timestamp: initialState.timestamp / 1000,
      // @ts-expect-error replay event type accepts this
      error_ids: errorIds,
      trace_ids: traceIds,
      urls,
    },
    { event_id: session.id }
  );
}
