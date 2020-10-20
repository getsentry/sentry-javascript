import { Session as SessionInterface, SessionContext, SessionStatus } from '@sentry/types';
import { dropUndefinedKeys, uuid4 } from '@sentry/utils';

/**
 * @inheritdoc
 */
export class Session implements SessionInterface {
  public userAgent?: string;
  public errors: number = 0;
  public release?: string;
  public sid: string = uuid4();
  public did?: string;
  public timestamp: number = Date.now();
  public started: number = Date.now();
  public duration: number = 0;
  public status: SessionStatus = SessionStatus.Ok;
  public environment?: string;
  public ipAddress?: string;

  constructor(context?: Omit<SessionContext, 'started' | 'status'>) {
    if (context) {
      this.update(context);
    }
  }

  /** JSDoc */
  // eslint-disable-next-line complexity
  update(context: SessionContext = {}): void {
    if (context.user) {
      if (context.user.ip_address) {
        this.ipAddress = context.user.ip_address;
      }

      if (!context.did) {
        this.did = context.user.id || context.user.email || context.user.username;
      }
    }

    this.timestamp = context.timestamp || Date.now();

    if (context.sid) {
      // Good enough uuid validation. — Kamil
      this.sid = context.sid.length === 32 ? context.sid : uuid4();
    }
    if (context.did) {
      this.did = `${context.did}`;
    }
    if (typeof context.started === 'number') {
      this.started = context.started;
    }
    if (typeof context.duration === 'number') {
      this.duration = context.duration;
    } else {
      this.duration = this.timestamp - this.started;
    }
    if (context.release) {
      this.release = context.release;
    }
    if (context.environment) {
      this.environment = context.environment;
    }
    if (context.ipAddress) {
      this.ipAddress = context.ipAddress;
    }
    if (context.userAgent) {
      this.userAgent = context.userAgent;
    }
    if (typeof context.errors === 'number') {
      this.errors = context.errors;
    }
    if (context.status) {
      this.status = context.status;
    }
  }

  /** JSDoc */
  close(status?: Exclude<SessionStatus, SessionStatus.Ok>): void {
    if (status) {
      this.update({ status });
    } else if (this.status === SessionStatus.Ok) {
      this.update({ status: SessionStatus.Exited });
    } else {
      this.update();
    }
  }

  /** JSDoc */
  toJSON(): {
    init: boolean;
    sid: string;
    did?: string;
    timestamp: string;
    started: string;
    duration: number;
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
      sid: `${this.sid}`,
      init: true,
      started: new Date(this.started).toISOString(),
      timestamp: new Date(this.timestamp).toISOString(),
      status: this.status,
      errors: this.errors,
      did: typeof this.did === 'number' || typeof this.did === 'string' ? `${this.did}` : undefined,
      duration: this.duration,
      attrs: dropUndefinedKeys({
        release: this.release,
        environment: this.environment,
        ip_address: this.ipAddress,
        user_agent: this.userAgent,
      }),
    });
  }
}
