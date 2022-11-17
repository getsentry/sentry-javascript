import { REPLAY_SESSION_KEY } from './constants';
import { Session } from './Session';

export function saveSession(session: Session) {
  const hasSessionStorage = 'sessionStorage' in window;
  if (!hasSessionStorage) {
    return;
  }

  try {
    window.sessionStorage.setItem(REPLAY_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore potential SecurityError exceptions
  }
}
