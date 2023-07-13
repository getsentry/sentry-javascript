import type { ReplayRecordingMode } from '@sentry/types';

import type { Session, Timeouts } from '../types';
import { isExpired } from '../util/isExpired';

/** Check the state of the session. */
export function checkSessionState(
  session: Session,
  recordingMode: ReplayRecordingMode,
  timeouts: Timeouts,
  callbacks: {
    onPause: () => void;
    ensureResumed: () => void;
    onEnd: () => void;
    onContinue: () => void;
  },
): void {
  const _isIdle = (): boolean => {
    return isExpired(session.lastActivity, timeouts.sessionIdlePause);
  };

  const _exceedsMaxLength = (): boolean => {
    return isExpired(session.started, timeouts.maxSessionLife);
  };

  // When buffering, we never want to expire/end/pause/restart the recording
  if (recordingMode === 'buffer') {
    callbacks.onContinue();
    return;
  }

  if (_exceedsMaxLength()) {
    callbacks.onEnd();
    return;
  }

  if (_isIdle()) {
    callbacks.onPause();
    return;
  }

  callbacks.ensureResumed();

  callbacks.onContinue();
}
