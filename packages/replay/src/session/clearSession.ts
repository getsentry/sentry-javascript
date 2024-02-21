import { REPLAY_SESSION_KEY, WINDOW } from '../../src/constants';
import type { ReplayContainer } from '../../src/types';
import { hasSessionStorage } from '../util/hasSessionStorage';

/**
 * Removes the session from Session Storage and unsets session in replay instance
 */
export function clearSession(replay: ReplayContainer): void {
  deleteSession();
  replay.session = undefined;
}

/**
 * Deletes a session from storage
 */
function deleteSession(): void {
  if (!hasSessionStorage()) {
    return;
  }

  try {
    WINDOW.sessionStorage.removeItem(REPLAY_SESSION_KEY);
  } catch {
    // Ignore potential SecurityError exceptions
  }
}
