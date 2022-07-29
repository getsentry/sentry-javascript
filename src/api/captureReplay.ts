import { captureEvent } from '@sentry/core';

import { ROOT_REPLAY_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';
import { InitialState } from '@/types';

interface CaptureReplayParams {
  session: Session;
  initialState: InitialState;
}

export function captureReplay({ session, initialState }: CaptureReplayParams) {
  captureEvent(
    {
      message: ROOT_REPLAY_NAME,
      tags: { segmentId: session.segmentId, url: initialState.url },
      timestamp: initialState.timestamp / 1000,
    },
    { event_id: session.id }
  );
}
