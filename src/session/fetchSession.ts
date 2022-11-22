import { SampleRates } from '../types';
import { REPLAY_SESSION_KEY } from './constants';
import { Session } from './Session';

/**
 * Fetches a session from storage
 */
export function fetchSession({ sessionSampleRate, errorSampleRate }: SampleRates): Session | null {
  const hasSessionStorage = 'sessionStorage' in window;

  if (!hasSessionStorage) {
    return null;
  }

  try {
    // This can throw if cookies are disabled
    const sessionStringFromStorage = window.sessionStorage.getItem(REPLAY_SESSION_KEY);

    if (!sessionStringFromStorage) {
      return null;
    }

    const sessionObj = JSON.parse(sessionStringFromStorage);

    return new Session(
      sessionObj,
      // We are assuming that if there is a saved item, then the session is sticky,
      // however this could break down if we used a different storage mechanism (e.g. localstorage)
      { stickySession: true, sessionSampleRate, errorSampleRate },
    );
  } catch {
    return null;
  }
}
