import { Session } from '@/session/Session';

import { isExpired } from './isExpired';

/**
 * Checks to see if session is expired
 */
export function isSessionExpired(
  session: Session,
  expiry: number,
  targetTime = +new Date()
) {
  return isExpired(session?.lastActivity, expiry, targetTime);
}
