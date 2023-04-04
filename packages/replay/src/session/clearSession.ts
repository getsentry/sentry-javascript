import { REPLAY_SESSION_KEY, WINDOW } from '../../src/constants';
import type { ReplayContainer } from '../../src/types';

/**
 *
 */
export function clearSession(replay: ReplayContainer): void {
  deleteSession();
  replay.session = undefined;
}

/**
 * Deletes a session from storage
 */
function deleteSession(): void {
  const hasSessionStorage = 'sessionStorage' in WINDOW;

  if (!hasSessionStorage) {
    return;
  }

  try {
    WINDOW.sessionStorage.removeItem(REPLAY_SESSION_KEY);
  } catch {
    // Ignore potential SecurityError exceptions
  }
}
