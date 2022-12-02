import { WINDOW } from '../types';
import { REPLAY_SESSION_KEY } from './constants';

/**
 * Deletes a session from storage
 */
export function deleteSession(): void {
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
