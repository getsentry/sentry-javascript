import { MAX_SESSION_LIFE } from '../session/constants';
import { Session } from '../session/Session';
import { isExpired } from './isExpired';

/**
 * Checks to see if session is expired
 */
export function isSessionExpired(session: Session, idleTimeout: number, targetTime: number = +new Date()): boolean {
  return (
    // First, check that maximum session length has not been exceeded
    isExpired(session.started, MAX_SESSION_LIFE, targetTime) ||
    // check that the idle timeout has not been exceeded (i.e. user has
    // performed an action within the last `idleTimeout` ms)
    isExpired(session?.lastActivity, idleTimeout, targetTime)
  );
}
