import type { Session, Timeouts } from '../types';
import { isSessionExpired } from '../util/isSessionExpired';

/** If the session should be refreshed or not. */
export function shouldRefreshSession(session: Session, timeouts: Timeouts): boolean {
  // If not expired, all good, just keep the session
  if (!isSessionExpired(session, timeouts)) {
    return false;
  }

  // If we are buffering & haven't ever flushed yet, always continue
  if (session.sampled === 'buffer' && session.segmentId === 0) {
    return false;
  }

  return true;
}
