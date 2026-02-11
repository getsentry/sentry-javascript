import { REPLAY_SESSION_KEY, WINDOW } from '../constants';
import { DEBUG_BUILD } from '../debug-build';
import type { Session } from '../types';
import { hasSessionStorage } from '../util/hasSessionStorage';
import { debug } from '../util/logger';
import { makeSession } from './Session';

/**
 * Fetches a session from storage
 */
export function fetchSession(): Session | null {
  if (!hasSessionStorage()) {
    return null;
  }

  try {
    // This can throw if cookies are disabled
    const sessionStringFromStorage = WINDOW.sessionStorage.getItem(REPLAY_SESSION_KEY);

    if (!sessionStringFromStorage) {
      return null;
    }

    const sessionObj = JSON.parse(sessionStringFromStorage) as Session;

    DEBUG_BUILD && debug.infoTick('Loading existing session');

    return makeSession(sessionObj);
  } catch {
    return null;
  }
}
