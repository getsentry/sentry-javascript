import { REPLAY_SESSION_KEY, WINDOW } from '../constants';
import type { Session } from '../types';
import { hasSessionStorage } from '../util/hasSessionStorage';
import { logInfoNextTick } from '../util/log';
import { makeSession } from './Session';

/**
 * Fetches a session from storage
 */
export function fetchSession(traceInternals?: boolean): Session | null {
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

    logInfoNextTick('[Replay] Loading existing session', traceInternals);

    return makeSession(sessionObj);
  } catch {
    return null;
  }
}
