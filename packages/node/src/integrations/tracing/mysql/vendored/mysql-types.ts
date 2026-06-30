/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql
 * - Upstream version: @opentelemetry/instrumentation-mysql@0.64.0
 * - Simplified type definitions inlined from the `mysql` package to avoid requiring it as a dependency
 */

export interface MysqlError extends Error {
  code: string;
  errno: number;
  fatal: boolean;
  sql?: string;
  sqlState?: string;
  sqlMessage?: string;
  [key: string]: unknown;
}

export interface ConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  [key: string]: unknown;
}

export interface PoolConfig extends ConnectionConfig {
  connectionConfig?: ConnectionConfig;
  [key: string]: unknown;
}

export interface QueryOptions {
  sql: string;
  values?: unknown;
  [key: string]: unknown;
}

export interface FieldInfo {
  catalog: string;
  db: string;
  table: string;
  orgTable: string;
  name: string;
  orgName: string;
  charsetNr: number;
  length: number;
  type: number;
  [key: string]: unknown;
}

export type queryCallback = (err: MysqlError | null, results?: unknown, fields?: FieldInfo[]) => void;

export interface Query {
  sql: string;
  values?: unknown;
  on(event: string, listener: (...args: unknown[]) => void): this;
  [key: string]: unknown;
}

export type QueryFunction = {
  (query: string | QueryOptions, callback?: queryCallback): Query;
  (query: string | QueryOptions, values?: unknown, callback?: queryCallback): Query;
};

export interface Connection {
  config: ConnectionConfig;
  query: QueryFunction;
  [key: string]: unknown;
}

export interface PoolConnection extends Connection {
  release(): void;
  [key: string]: unknown;
}

export interface Pool {
  config: PoolConfig;
  query: QueryFunction;
  getConnection(callback: (err: MysqlError, connection: PoolConnection) => void): void;
  end(callback?: (err?: MysqlError) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): this;
  [key: string]: unknown;
}

export interface PoolCluster {
  getConnection(callback: (err: MysqlError, connection: PoolConnection) => void): void;
  getConnection(pattern: string, callback: (err: MysqlError, connection: PoolConnection) => void): void;
  getConnection(
    pattern: string,
    selector: string,
    callback: (err: MysqlError, connection: PoolConnection) => void,
  ): void;
  add(config: PoolConfig): void;
  add(id: string, config: PoolConfig): void;
  [key: string]: unknown;
}

export declare function createConnection(connectionUri: string | ConnectionConfig): Connection;
export declare function createPool(config: string | PoolConfig): Pool;
export declare function createPoolCluster(config?: PoolConfig): PoolCluster;
