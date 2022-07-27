import { captureEvent } from '@sentry/core';

import type { Session } from '@/session/Session';
import { REPLAY_EVENT_NAME } from '@/session/constants';
import { uuid4 } from '@sentry/utils';

export function captureReplayUpdate(session: Session, timestamp: number) {
  captureEvent({
    timestamp,
    message: `${REPLAY_EVENT_NAME}-${uuid4().substring(16)}`,
    tags: {
      replayId: session.id,
      segmentId: session.segmentId++,
    },
  });
}
