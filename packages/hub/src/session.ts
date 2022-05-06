import { Session, SessionContext, SessionStatus } from '@sentry/types';
import { dropUndefinedKeys, timestampInSeconds, uuid4 } from '@sentry/utils';

/**
 * TODO jsdoc
 * @param context
 * @returns
 */
export function makeSession(context?: Omit<SessionContext, 'started' | 'status'>): Session {
  // Both timestamp and started are in seconds since the UNIX epoch.
  const startingTime = timestampInSeconds();

  const basicSession = {
    timestamp: startingTime,
    started: startingTime,
  };

  return {
    ...basicSession,
    ...(context ? updateSession(basicSession, context) : undefined),
  };
}

/**
 * TODO jsdoc
 * @param session
 * @param context
 * @returns
 */
// eslint-disable-next-line complexity
export function updateSession(originalSession: Session, context: SessionContext = {}): Session {
  const session = { ...originalSession };

  if (context.user) {
    if (!session.ipAddress && context.user.ip_address) {
      session.ipAddress = context.user.ip_address;
    }

    if (!session.did && !context.did) {
      session.did = context.user.id || context.user.email || context.user.username;
    }
  }

  session.timestamp = context.timestamp || timestampInSeconds();

  if (context.ignoreDuration) {
    session.ignoreDuration = context.ignoreDuration;
  }
  if (context.sid) {
    // Good enough uuid validation. — Kamil
    session.sid = context.sid.length === 32 ? context.sid : uuid4();
  }
  if (context.init !== undefined) {
    session.init = context.init;
  }
  if (!session.did && context.did) {
    session.did = `${context.did}`;
  }
  if (typeof context.started === 'number') {
    session.started = context.started;
  }
  if (session.ignoreDuration) {
    session.duration = undefined;
  } else if (typeof context.duration === 'number') {
    session.duration = context.duration;
  } else {
    const duration = session.timestamp - (session.started || 0);
    session.duration = duration >= 0 ? duration : 0;
  }
  if (context.release) {
    session.release = context.release;
  }
  if (context.environment) {
    session.environment = context.environment;
  }
  if (!session.ipAddress && context.ipAddress) {
    session.ipAddress = context.ipAddress;
  }
  if (!session.userAgent && context.userAgent) {
    session.userAgent = context.userAgent;
  }
  if (typeof context.errors === 'number') {
    session.errors = context.errors;
  }
  if (context.status) {
    session.status = context.status;
  }

  return session;
}

/**
 * TODO doc
 * @param status
 */
export function closeSession(session: Session, status?: Exclude<SessionStatus, 'ok'>): Session {
  let context = {};
  if (status) {
    context = { status };
  } else if (session === 'ok') {
    context = { status: 'exited' };
  }

  return updateSession(session, context);
}

/**
 * TODO doc
 * @returns
 */
export function sessionToJSON(session: Session): {
  init: boolean;
  sid: string;
  did?: string;
  timestamp: string;
  started: string;
  duration?: number;
  status: SessionStatus;
  errors: number;
  attrs?: {
    release?: string;
    environment?: string;
    user_agent?: string;
    ip_address?: string;
  };
} {
  return dropUndefinedKeys({
    sid: `${session.sid}`,
    init: session.init !== undefined ? session.init : true,
    // Make sure that sec is converted to ms for date constructor
    started: new Date((session.started || 0) * 1000).toISOString(),
    timestamp: new Date((session.timestamp || 0) * 1000).toISOString(),
    status: session.status || 'ok',
    errors: session.errors || 0,
    did: typeof session.did === 'number' || typeof session.did === 'string' ? `${session.did}` : undefined,
    duration: session.duration || 0,
    attrs: {
      release: session.release,
      environment: session.environment,
      ip_address: session.ipAddress,
      user_agent: session.userAgent,
    },
  });
}
