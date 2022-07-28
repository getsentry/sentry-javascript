import { captureEvent } from '@sentry/core';
import { uuid4 } from '@sentry/utils';

import { REPLAY_EVENT_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';

export function captureReplayUpdate(session: Session, timestamp: number) {
  captureEvent({
    timestamp: timestamp / 1000,
    message: `${REPLAY_EVENT_NAME}-${uuid4().substring(16)}`,
    tags: {
      replayId: session.id,
      segmentId: session.segmentId++,
    },
  });
}
