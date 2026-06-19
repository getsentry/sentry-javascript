/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongodb
 * - Upstream version: @opentelemetry/instrumentation-mongodb@0.71.0
 * - Trimmed to the driver-internal types actually used by the instrumentation
 */

export type MongoInternalCommand = {
  findandmodify: boolean;
  createIndexes: boolean;
  count: boolean;
  aggregate: boolean;
  ismaster: boolean;
  indexes?: unknown[];
  query?: Record<string, unknown>;
  limit?: number;
  q?: Record<string, unknown>;
  u?: Record<string, unknown>;
};

export type CursorState = { cmd: MongoInternalCommand } & Record<string, unknown>;

// https://github.com/mongodb/node-mongodb-native/blob/3.6/lib/core/wireprotocol/index.js
export type WireProtocolInternal = {
  insert: (
    server: MongoInternalTopology,
    ns: string,
    ops: unknown[],
    options: unknown | Function,
    callback?: Function,
  ) => unknown;
  update: (
    server: MongoInternalTopology,
    ns: string,
    ops: unknown[],
    options: unknown | Function,
    callback?: Function,
  ) => unknown;
  remove: (
    server: MongoInternalTopology,
    ns: string,
    ops: unknown[],
    options: unknown | Function,
    callback?: Function,
  ) => unknown;
  killCursors: (server: MongoInternalTopology, ns: string, cursorState: CursorState, callback: Function) => unknown;
  getMore: (
    server: MongoInternalTopology,
    ns: string,
    cursorState: CursorState,
    batchSize: number,
    options: unknown | Function,
    callback?: Function,
  ) => unknown;
  query: (
    server: MongoInternalTopology,
    ns: string,
    cmd: MongoInternalCommand,
    cursorState: CursorState,
    options: unknown | Function,
    callback?: Function,
  ) => unknown;
  command: (
    server: MongoInternalTopology,
    ns: string,
    cmd: MongoInternalCommand,
    options: unknown | Function,
    callback?: Function,
  ) => unknown;
};

// https://github.com/mongodb/node-mongodb-native/blob/3.6/lib/topologies/server.js#L172
// https://github.com/mongodb/node-mongodb-native/blob/2.2/lib/server.js#L174
export type MongoInternalTopology = {
  s?: {
    // those are for mongodb@3
    options?: {
      host?: string;
      port?: number;
      servername?: string;
    };
    // those are for mongodb@2
    host?: string;
    port?: number;
  };
  // mongodb@3 with useUnifiedTopology option
  description?: {
    address?: string;
  };
};

export enum MongodbCommandType {
  CREATE_INDEXES = 'createIndexes',
  FIND_AND_MODIFY = 'findAndModify',
  IS_MASTER = 'isMaster',
  COUNT = 'count',
  AGGREGATE = 'aggregate',
  UNKNOWN = 'unknown',
}

// https://github.com/mongodb/js-bson/blob/main/src/bson.ts
export type Document = {
  [key: string]: any;
};

// https://github.com/mongodb/node-mongodb-native/blob/v6.4.0/src/utils.ts#L281
export interface MongodbNamespace {
  db: string;
  collection?: string;
}

export type V4Connection = {
  command: Function;
  // From version 6.4.0 the method does not expect a callback and returns a promise
  // https://github.com/mongodb/node-mongodb-native/blob/v6.4.2/src/cmap/connection.ts
  commandPromise(
    ns: MongodbNamespace,
    cmd: Document,
    options: undefined | unknown,
    // From v6.6.0 we have this new param which is a constructor function
    // https://github.com/mongodb/node-mongodb-native/blob/v6.6.0/src/cmap/connection.ts#L588
    responseType: undefined | unknown,
  ): Promise<any>;
  // Earlier versions expect a callback param and return void
  // https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connection.ts
  commandCallback(ns: MongodbNamespace, cmd: Document, options: undefined | unknown, callback: any): void;
};

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connection_pool.ts
export type V4ConnectionPool = {
  // Instrumentation just cares about carrying the async context so
  // types of callback params are not needed
  checkOut: (callback: (error: any, connection: any) => void) => void;
};
