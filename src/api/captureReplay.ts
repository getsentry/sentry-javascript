import { captureEvent } from '@sentry/core';

import { ROOT_REPLAY_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';
import { InitialState } from '@/types';

export function captureReplay(session: Session, initialState: InitialState) {
  captureEvent(
    {
      message: ROOT_REPLAY_NAME,
      tags: { segmentId: session.segmentId, url: initialState.url },
      timestamp: initialState.timestamp / 1000,
    },
    { event_id: session.id }
  );
}
