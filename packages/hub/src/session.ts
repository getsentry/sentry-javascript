import {
  AggregationCounts,
  RequestSessionStatus,
  Session as SessionInterface,
  SessionAggregates,
  SessionContext,
  SessionFlusherLike,
  SessionStatus,
  Transport,
} from '@sentry/types';
import { dropUndefinedKeys, logger, uuid4 } from '@sentry/utils';

import { getCurrentHub } from './hub';

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
  public init: boolean = true;

  public constructor(context?: Omit<SessionContext, 'started' | 'status'>) {
    if (context) {
      this.update(context);
    }
  }

  /** JSDoc */
  // eslint-disable-next-line complexity
  public update(context: SessionContext = {}): void {
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
    if (context.init !== undefined) {
      this.init = context.init;
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
  public close(status?: Exclude<SessionStatus, SessionStatus.Ok>): void {
    if (status) {
      this.update({ status });
    } else if (this.status === SessionStatus.Ok) {
      this.update({ status: SessionStatus.Exited });
    } else {
      this.update();
    }
  }

  /** JSDoc */
  public toJSON(): {
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
      init: this.init,
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

type ReleaseHealthAttributes = {
  environment?: string;
  release: string;
};

/**
 * @inheritdoc
 */
export class SessionFlusher implements SessionFlusherLike {
  public readonly flushTimeout: number = 60;
  private _pendingAggregates: Record<number, AggregationCounts> = {};
  private _sessionAttrs: ReleaseHealthAttributes;
  private _intervalId: ReturnType<typeof setInterval>;
  private _isEnabled: boolean = true;
  private _transport: Transport;

  public constructor(transport: Transport, attrs: ReleaseHealthAttributes) {
    this._transport = transport;
    // Call to setInterval, so that flush is called every 60 seconds
    this._intervalId = setInterval(() => this.flush(), this.flushTimeout * 1000);
    this._sessionAttrs = attrs;
  }

  /** Sends session aggregates to Transport */
  public sendSessionAggregates(sessionAggregates: SessionAggregates): void {
    if (!this._transport.sendSession) {
      logger.warn("Dropping session because custom transport doesn't implement sendSession");
      return;
    }
    this._transport.sendSession(sessionAggregates).then(null, reason => {
      logger.error(`Error while sending session: ${reason}`);
    });
  }

  /** Checks if `pendingAggregates` has entries, and if it does flushes them by calling `sendSessions` */
  public flush(): void {
    const sessionAggregates = this.getSessionAggregates();
    if (sessionAggregates.aggregates.length === 0) {
      return;
    }
    this._pendingAggregates = {};
    this.sendSessionAggregates(sessionAggregates);
  }

  /** Massages the entries in `pendingAggregates` and returns aggregated sessions */
  public getSessionAggregates(): SessionAggregates {
    const aggregates: AggregationCounts[] = Object.keys(this._pendingAggregates).map((key: string) => {
      return this._pendingAggregates[parseInt(key)];
    });

    const sessionAggregates: SessionAggregates = {
      attrs: this._sessionAttrs,
      aggregates,
    };
    return dropUndefinedKeys(sessionAggregates);
  }

  /** JSDoc */
  public close(): void {
    clearInterval(this._intervalId);
    this._isEnabled = false;
    this.flush();
  }

  /**
   * Wrapper function for _incrementSessionStatusCount that checks if the instance of SessionFlusher is enabled then
   * fetches the session status of the request from `Scope.getRequestSession().status` on the scope and passes them to
   * `_incrementSessionStatusCount` along with the start date
   */
  public incrementSessionStatusCount(): void {
    if (!this._isEnabled) {
      return;
    }
    const scope = getCurrentHub().getScope();
    const requestSession = scope?.getRequestSession();

    if (requestSession && requestSession.status) {
      this._incrementSessionStatusCount(requestSession.status, new Date());
      // This is not entirely necessarily but is added as a safe guard to indicate the bounds of a request and so in
      // case captureRequestSession is called more than once to prevent double count
      scope?.setRequestSession(undefined);

      /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    }
  }

  /**
   * Increments status bucket in pendingAggregates buffer (internal state) corresponding to status of
   * the session received
   */
  private _incrementSessionStatusCount(status: RequestSessionStatus, date: Date): number {
    // Truncate minutes and seconds on Session Started attribute to have one minute bucket keys
    const sessionStartedTrunc = new Date(date).setSeconds(0, 0);
    this._pendingAggregates[sessionStartedTrunc] = this._pendingAggregates[sessionStartedTrunc] || {};

    // corresponds to aggregated sessions in one specific minute bucket
    // for example, {"started":"2021-03-16T08:00:00.000Z","exited":4, "errored": 1}
    const aggregationCounts: AggregationCounts = this._pendingAggregates[sessionStartedTrunc];
    if (!aggregationCounts.started) {
      aggregationCounts.started = new Date(sessionStartedTrunc).toISOString();
    }

    switch (status) {
      case RequestSessionStatus.Errored:
        aggregationCounts.errored = (aggregationCounts.errored || 0) + 1;
        return aggregationCounts.errored;
      case RequestSessionStatus.Ok:
        aggregationCounts.exited = (aggregationCounts.exited || 0) + 1;
        return aggregationCounts.exited;
      case RequestSessionStatus.Crashed:
        aggregationCounts.crashed = (aggregationCounts.crashed || 0) + 1;
        return aggregationCounts.crashed;
    }
  }
}
