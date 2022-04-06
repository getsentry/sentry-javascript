import { REPLAY_SESSION_KEY } from './constants';
import { ReplaySession } from './types';

export function fetchSession(): ReplaySession | null {
  const hasSessionStorage = 'sessionStorage' in window;

  if (!hasSessionStorage) {
    return null;
  }

  try {
    return JSON.parse(window.sessionStorage.getItem(REPLAY_SESSION_KEY));
  } catch {
    return null;
  }
}
