import type { Session } from '../types';
import { isExpired } from './isExpired';

/**
 * Checks to see if session is expired
 */
export function isSessionExpired(
  session: Session,
  {
    maxReplayDuration,
    sessionIdleExpire,
    targetTime = Date.now(),
  }: { maxReplayDuration: number; sessionIdleExpire: number; targetTime?: number },
): boolean {
  return (
    // First, check that maximum session length has not been exceeded
    isExpired(session.started, maxReplayDuration, targetTime) ||
    // check that the idle timeout has not been exceeded (i.e. user has
    // performed an action within the last `sessionIdleExpire` ms)
    isExpired(session.lastActivity, sessionIdleExpire, targetTime)
  );
}
