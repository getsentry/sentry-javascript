import { REPLAY_SESSION_KEY } from './constants';

/**
 * Deletes a session from storage
 */
export function deleteSession(): void {
  const hasSessionStorage = 'sessionStorage' in window;

  if (!hasSessionStorage) {
    return;
  }

  try {
    window.sessionStorage.removeItem(REPLAY_SESSION_KEY);
  } catch {
    // Ignore potential SecurityError exceptions
  }
}
