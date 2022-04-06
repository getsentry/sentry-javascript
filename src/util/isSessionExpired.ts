import { ReplaySession } from '@/session';
import { isExpired } from './isExpired';

/**
 * Checks to see if session is expired
 */
export function isSessionExpired(
  session: ReplaySession,
  expiry: number,
  targetTime = +new Date()
) {
  return isExpired(session.lastActivity, expiry, targetTime);
}
