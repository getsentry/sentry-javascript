/*
 * Simplified type definitions inlined from the `pg-pool` package.
 * Only the members actually used by the vendored instrumentation are included.
 */
/* eslint-disable */

export interface PgPool {
  connect(callback?: any): any;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  options: any;
  on(event: string, listener: (...args: any[]) => void): this;
  [key: string]: any;
}
