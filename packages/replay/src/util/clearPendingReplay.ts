import { PENDING_REPLAY_DATA_KEY, PENDING_REPLAY_STATUS_KEY, WINDOW } from '../constants';

/**
 * Clears pending segment that was previously unable to be sent (e.g. due to page reload).
 */
export function clearPendingReplay(): void {
  WINDOW.sessionStorage.removeItem(PENDING_REPLAY_STATUS_KEY);
  WINDOW.sessionStorage.removeItem(PENDING_REPLAY_DATA_KEY);
}
