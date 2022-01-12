import { Session as SessionInterface, SessionContext, SessionStatus } from '@sentry/types';
import { dropUndefinedKeys, timestampInSeconds, uuid4 } from '@sentry/utils';

/**
 * Session Context
 */
export class Session implements SessionInterface {
  public userAgent?: string;
  public errors: number = 0;
  public release?: string;
  public sid: string = uuid4();
  public did?: string;
  public timestamp: number;
  public started: number;
  public duration?: number = 0;
  public status: SessionStatus = 'ok';
  public environment?: string;
  public ipAddress?: string;
  public init: boolean = true;
  public ignoreDuration: boolean = false;

  public constructor(context?: Omit<SessionContext, 'started' | 'status'>) {
    // Both timestamp and started are in seconds since the UNIX epoch.
    const startingTime = timestampInSeconds();
    this.timestamp = startingTime;
    this.started = startingTime;
    if (context) {
      updateSession(this, context);
    }
  }
}

/** JSDoc */
// eslint-disable-next-line complexity
export function updateSession(session: Session, context: SessionContext = {}): void {
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
    const duration = session.timestamp - session.started;
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
}

/** JSDoc */
export function closeSession(session: Session, status?: Exclude<SessionStatus, 'ok'>): void {
  if (status) {
    updateSession(session, { status });
  } else if (session.status === 'ok') {
    updateSession(session, { status: 'exited' });
  } else {
    updateSession(session);
  }
}

/** JSDoc */
export function sessionAsJSON(
  session: Session,
): {
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
    init: session.init,
    // Make sure that sec is converted to ms for date constructor
    started: new Date(session.started * 1000).toISOString(),
    timestamp: new Date(session.timestamp * 1000).toISOString(),
    status: session.status,
    errors: session.errors,
    did: typeof session.did === 'number' || typeof session.did === 'string' ? `${session.did}` : undefined,
    duration: session.duration,
    attrs: {
      release: session.release,
      environment: session.environment,
      ip_address: session.ipAddress,
      user_agent: session.userAgent,
    },
  });
}
