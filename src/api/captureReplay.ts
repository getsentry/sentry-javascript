import { getCurrentHub } from '@sentry/browser';

import { ROOT_REPLAY_NAME } from '@/session/constants';
import type { Session } from '@/session/Session';

export function captureReplay(session: Session) {
  const hub = getCurrentHub();

  hub.captureEvent(
    {
      message: ROOT_REPLAY_NAME,
      tags: { sequenceId: session.sequenceId },
    },
    { event_id: session.id }
  );
}
