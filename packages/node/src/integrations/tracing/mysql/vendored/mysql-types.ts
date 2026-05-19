/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql
 * - Upstream version: @opentelemetry/instrumentation-mysql@0.64.0
 * - Simplified type definitions inlined from the `mysql` package to avoid requiring it as a dependency
 */
/* eslint-disable */

export interface MysqlError extends Error {
  code: string;
  errno: number;
  fatal: boolean;
  sql?: string;
  sqlState?: string;
  sqlMessage?: string;
  [key: string]: any;
}

export interface ConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  [key: string]: any;
}

export interface PoolConfig extends ConnectionConfig {
  connectionConfig?: ConnectionConfig;
  [key: string]: any;
}

export interface QueryOptions {
  sql: string;
  values?: any;
  [key: string]: any;
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
  [key: string]: any;
}

export type queryCallback = (err: MysqlError | null, results?: any, fields?: FieldInfo[]) => void;

export interface Query {
  sql: string;
  values?: any;
  on(event: string, listener: (...args: any[]) => void): this;
  [key: string]: any;
}

export type QueryFunction = {
  (query: string | QueryOptions, callback?: queryCallback): Query;
  (query: string | QueryOptions, values?: any, callback?: queryCallback): Query;
};

export interface Connection {
  config: ConnectionConfig;
  query: QueryFunction;
  [key: string]: any;
}

export interface PoolConnection extends Connection {
  release(): void;
  [key: string]: any;
}

export interface Pool {
  config: PoolConfig;
  query: QueryFunction;
  getConnection(callback: (err: MysqlError, connection: PoolConnection) => void): void;
  end(callback?: (err?: MysqlError) => void): void;
  on(event: string, listener: (...args: any[]) => void): this;
  [key: string]: any;
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
  [key: string]: any;
}

export declare function createConnection(connectionUri: string | ConnectionConfig): Connection;
export declare function createPool(config: string | PoolConfig): Pool;
export declare function createPoolCluster(config?: PoolConfig): PoolCluster;
