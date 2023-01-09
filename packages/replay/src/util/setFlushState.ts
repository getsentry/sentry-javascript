import { PENDING_REPLAY_DATA_KEY, PENDING_REPLAY_STATUS_KEY, WINDOW } from '../constants';
import type { PendingReplayData } from '../types';
import { FlushState } from '../types';

/**
 *
 */
export function setFlushState(state: FlushState, data?: PendingReplayData): void {
  if (data) {
    WINDOW.sessionStorage.setItem(PENDING_REPLAY_DATA_KEY, JSON.stringify(data));
  }

  if (state === FlushState.SENT_REQUEST) {
    WINDOW.sessionStorage.removeItem(PENDING_REPLAY_DATA_KEY);
  } else if (state === FlushState.COMPLETE) {
    WINDOW.sessionStorage.removeItem(PENDING_REPLAY_STATUS_KEY);
  } else {
    WINDOW.sessionStorage.setItem(PENDING_REPLAY_STATUS_KEY, state);
  }
}
