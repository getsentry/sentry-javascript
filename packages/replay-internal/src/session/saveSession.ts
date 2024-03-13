import { REPLAY_SESSION_KEY, WINDOW } from '../constants';
import type { Session } from '../types';
import { hasSessionStorage } from '../util/hasSessionStorage';

/**
 * Save a session to session storage.
 */
export function saveSession(session: Session): void {
  if (!hasSessionStorage()) {
    return;
  }

  try {
    WINDOW.sessionStorage.setItem(REPLAY_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore potential SecurityError exceptions
  }
}
