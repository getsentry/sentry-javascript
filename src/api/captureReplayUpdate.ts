import { captureEvent } from '@sentry/core';
import { uuid4 } from '@sentry/utils';

import { REPLAY_EVENT_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';

interface CaptureReplayUpdateParams {
  session: Session;
  /**
   * Timestamp of the event in milliseconds
   */
  timestamp: number;
  errorIds: string[];
}
export function captureReplayUpdate({
  session,
  timestamp,
  errorIds,
}: CaptureReplayUpdateParams) {
  captureEvent({
    timestamp: timestamp / 1000,
    message: `${REPLAY_EVENT_NAME}-${uuid4().substring(16)}`,
    // @ts-expect-error replay event type accepts this
    errorIds,
    tags: {
      replayId: session.id,
      segmentId: session.segmentId++,
    },
  });
}
