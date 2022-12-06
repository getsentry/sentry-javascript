import { REPLAY_SESSION_KEY, WINDOW } from '../constants';
import { SampleRates } from '../types';
import { makeSession, sampleSession, Session } from './Session';

/**
 * Fetches a session from storage
 */
export function fetchSession({ sessionSampleRate, errorSampleRate }: SampleRates): Session | null {
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

    const sessionObj = JSON.parse(sessionStringFromStorage) as Partial<Session>;
    const sampled = sampleSession(sessionObj.sampled, sessionSampleRate, errorSampleRate);

    return makeSession({ ...sessionObj, sampled });
  } catch {
    return null;
  }
}
