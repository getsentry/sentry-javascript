/*
 * Simplified type definitions inlined from the `pg` package.
 * Only the members actually used by the vendored instrumentation are included.
 */
/* eslint-disable */

export interface PgClient {
  database: string;
  connectionParameters: {
    database?: string;
    host?: string;
    namespace?: string;
    port?: number;
    user?: string;
    [key: string]: any;
  };
  query(...args: any[]): any;
  connect(callback?: Function): any;
  [key: string]: any;
}

export interface QueryResult {
  command: string;
  rowCount: number | null;
  rows: any[];
  fields: any[];
  [key: string]: any;
}

export interface QueryArrayResult {
  command: string;
  rowCount: number | null;
  rows: any[][];
  fields: any[];
  [key: string]: any;
}
