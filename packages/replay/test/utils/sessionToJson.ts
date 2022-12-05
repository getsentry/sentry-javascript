import type { Session, SessionObject } from '../../src/session/Session';

export function sessionToJSON(session: Session): SessionObject {
  return {
    id: session.id,
    started: session.started,
    lastActivity: session.lastActivity,
    segmentId: session.segmentId,
    sampled: session.sampled,
  };
}
