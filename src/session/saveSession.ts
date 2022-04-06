import { REPLAY_SESSION_KEY } from './constants';
import { ReplaySession } from './types';

export function saveSession(session: ReplaySession) {
  const hasSessionStorage = 'sessionStorage' in window;
  if (!hasSessionStorage) {
    return;
  }

  try {
    window.sessionStorage.setItem(REPLAY_SESSION_KEY, JSON.stringify(session));
  } catch {
    // this shouldn't happen
  }
}
