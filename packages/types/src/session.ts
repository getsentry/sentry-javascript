import { User } from './user';

/**
 * @inheritdoc
 */
export interface Session extends SessionContext {
  /** JSDoc */
  update(context?: SessionContext): void;

  /** JSDoc */
  close(status?: SessionStatus): void;

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
  };
}

/**
 * Session Context
 */
export interface SessionContext {
  sid?: string;
  did?: string;
  init?: boolean;
  timestamp?: number;
  started?: number;
  duration?: number;
  status?: SessionStatus;
  release?: string;
  environment?: string;
  userAgent?: string;
  ipAddress?: string;
  errors?: number;
  user?: User | null;
}

/**
 * Session Status
 */
export enum SessionStatus {
  /** JSDoc */
  Ok = 'ok',
  /** JSDoc */
  Exited = 'exited',
  /** JSDoc */
  Crashed = 'crashed',
  /** JSDoc */
  Abnormal = 'abnormal',
}

export enum RequestSessionStatus {
  /** JSDoc */
  Ok = 'ok',
  /** JSDoc */
  Errored = 'errored',
}

/** JSDoc */
export interface SessionAggregate {
  attrs?: {
    environment?: string;
    release?: string;
  };
  aggregates: Array<AggregationCounts>;
}

export interface SessionFlusher {
  readonly flushTimeout: number;

  /** Getter function that returns a boolean flag that indicater whether an instance of Session Flusher is enabled */
  getEnabled(): void;

  /**
   * Increments the Session Status bucket in SessionAggregate Object corresponding to the status of the session
   * captured
   */
  incrementSessionStatusCount(): void;

  /** Submits the aggregates request mode sessions to Sentry */
  sendSessionAggregate(sessionAggregate: SessionAggregate): void;

  /** Empties Aggregate Buckets and Sends them to Transport Buffer */
  flush(): void;

  /** Clears setInterval and calls flush */
  close(): void;
}

export interface AggregationCounts {
  started: string;
  errored?: number;
  exited?: number;
}
