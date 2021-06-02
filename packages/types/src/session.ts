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
    duration?: number;
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

export interface RequestSession {
  status?: RequestSessionStatus;
}

/**
 * Session Context
 */
export interface SessionContext {
  sid?: string;
  did?: string;
  init?: boolean;
  // seconds since the UNIX epoch
  timestamp?: number;
  // seconds since the UNIX epoch
  started?: number;
  duration?: number;
  status?: SessionStatus;
  release?: string;
  environment?: string;
  userAgent?: string;
  ipAddress?: string;
  errors?: number;
  user?: User | null;
  ignoreDuration?: boolean;
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
  /** JSDoc */
  Crashed = 'crashed',
}

/** JSDoc */
export interface SessionAggregates {
  attrs?: {
    environment?: string;
    release?: string;
  };
  aggregates: Array<AggregationCounts>;
}

export interface SessionFlusherLike {
  /**
   * Increments the Session Status bucket in SessionAggregates Object corresponding to the status of the session
   * captured
   */
  incrementSessionStatusCount(): void;

  /** Submits the aggregates request mode sessions to Sentry */
  sendSessionAggregates(sessionAggregates: SessionAggregates): void;

  /** Empties Aggregate Buckets and Sends them to Transport Buffer */
  flush(): void;

  /** Clears setInterval and calls flush */
  close(): void;
}

export interface AggregationCounts {
  started: string;
  errored?: number;
  exited?: number;
  crashed?: number;
}
