import { REPLAY_SESSION_KEY, WINDOW } from '../constants';
import type { Session } from '../types';
import { makeSession } from './Session';

/**
 * Fetches a session from storage
 */
export function fetchSession(): Session | null {
  const hasSessionStorage = 'sessionStorage' in WINDOW;

  if (!hasSessionStorage) {
    return null;
  }

  try {
    // This can throw if cookies are disabled
    const sessionStringFromStorage = WINDOW.sessionStorage.getItem(REPLAY_SESSION_KEY);

    if (!sessionStringFromStorage) {
      return null;
    }

    const sessionObj = JSON.parse(sessionStringFromStorage) as Session;

    return makeSession(sessionObj);
  } catch {
    return null;
  }
}
