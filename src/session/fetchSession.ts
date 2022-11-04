import { captureInternalException } from '../util/captureInternalException';

import { REPLAY_SESSION_KEY } from './constants';
import { Session } from './Session';

/**
 * Fetches a session from storage
 */
export function fetchSession(): Session | null {
  const hasSessionStorage = 'sessionStorage' in window;

  if (!hasSessionStorage) {
    return null;
  }

  const sessionStringFromStorage =
    window.sessionStorage.getItem(REPLAY_SESSION_KEY);

  if (!sessionStringFromStorage) {
    return null;
  }

  try {
    const sessionObj = JSON.parse(sessionStringFromStorage);

    // NOTE: This shouldn't happen
    if (sessionObj.segmentId === 0) {
      captureInternalException(
        new Error('Session storage object with segmentId = 0')
      );
    }

    return new Session(
      sessionObj,
      // We are assuming that if there is a saved item, then the session is sticky,
      // however this could break down if we used a different storage mechanism (e.g. localstorage)
      { stickySession: true }
    );
  } catch {
    return null;
  }
}
