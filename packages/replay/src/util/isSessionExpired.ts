import type { Session, Timeouts } from '../types';
import { isExpired } from './isExpired';

/**
 * Checks to see if session is expired
 */
export function isSessionExpired(session: Session, timeouts: Timeouts, targetTime: number = +new Date()): boolean {
  return (
    // First, check that maximum session length has not been exceeded
    isExpired(session.started, timeouts.maxSessionLife, targetTime) ||
    // check that the idle timeout has not been exceeded (i.e. user has
    // performed an action within the last `idleTimeout` ms)
    isExpired(session.lastActivity, timeouts.sessionIdle, targetTime)
  );
}
