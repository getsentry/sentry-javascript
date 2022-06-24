import { REPLAY_SESSION_KEY } from './constants';
import { Session } from './Session';

export function fetchSession(): Session | null {
  const hasSessionStorage = 'sessionStorage' in window;

  if (!hasSessionStorage) {
    return null;
  }

  try {
    return new Session(
      JSON.parse(window.sessionStorage.getItem(REPLAY_SESSION_KEY)),
      // We are assuming that if there is a saved item, then the session is sticky,
      // however this could break down if we used a different storage mechanism (e.g. localstorage)
      { stickySession: true }
    );
  } catch {
    return null;
  }
}
