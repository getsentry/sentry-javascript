import { User } from './user';

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

export interface AggregationCounts {
  started: string;
  errored?: number;
  exited?: number;
  crashed?: number;
}
