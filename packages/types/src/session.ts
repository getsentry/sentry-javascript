import { User } from './user';

export interface RequestSession {
  status?: RequestSessionStatus;
}

/**
 * Session Context
 */
export interface Session {
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

export type SessionContext = Partial<Session>;

export type SessionStatus = 'ok' | 'exited' | 'crashed' | 'abnormal';
export type RequestSessionStatus = 'ok' | 'errored' | 'crashed';

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
