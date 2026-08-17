import { debug } from '@sentry/core/browser';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

export const SESSION_STORAGE_KEY = 'sentry_session';

/**
 * The subset of a session we need to resume it on a later page load. Timestamps are
 * in milliseconds, unlike the seconds-based timestamps on the session itself.
 */
export interface PersistedSession {
  sid: string;
  started: number;
  lastActivity: number;
}

export interface SessionExpiryOptions {
  idleTimeout: number;
  maxDuration: number;
}

/**
 * Reads the persisted session of the current browsing context, if there is one.
 */
export function getPersistedSession(): PersistedSession | undefined {
  try {
    const persisted = WINDOW.sessionStorage?.getItem(SESSION_STORAGE_KEY);
    // @ts-expect-error - intentionally risking JSON.parse throwing when persisted is null to save bundle size
    const session = JSON.parse(persisted) as PersistedSession;
    return session.sid ? session : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persists @param session so that the next page load in this browsing context can resume it.
 */
export function persistSession(session: PersistedSession): void {
  try {
    WINDOW.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    // Ignore potential errors (e.g. if sessionStorage is not available)
    DEBUG_BUILD && debug.warn('Could not persist session in sessionStorage', e);
  }
}

/**
 * Whether @param session has run past either of its lifetime bounds and a new session
 * should be started in its place.
 */
export function isSessionExpired(
  session: PersistedSession,
  { idleTimeout, maxDuration }: SessionExpiryOptions,
  now: number,
): boolean {
  return now - session.lastActivity > idleTimeout || now - session.started > maxDuration;
}
