import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

export const pgConfig = [
  // `pg` (node-postgres).
  // instruments `Client.prototype.query`/`connect` (both the JS and native
  // clients) plus `pg-pool`'s `Pool.prototype.connect`.
  // `Auto` covers the callback, promise, and streamable-`Submittable`
  // call shapes (like mysql).
  // `pg/lib/client.js` is `class Client { query() {...} connect() {...} }`,
  // so `className`+`methodName` matches directly.
  {
    channelName: 'query',
    module: { name: 'pg', versionRange: '>=8.0.3 <9', filePath: 'lib/client.js' },
    functionQuery: { className: 'Client', methodName: 'query', kind: 'Auto' },
  },
  {
    channelName: 'connect',
    module: { name: 'pg', versionRange: '>=8.0.3 <9', filePath: 'lib/client.js' },
    functionQuery: { className: 'Client', methodName: 'connect', kind: 'Auto' },
  },
  // The native client (`pg/lib/native/client.js`) is a constructor function,
  // not a class.
  // `Client.prototype.query = function (config, values, callback) {...}`
  // so it needs `expressionName` (the mysql shape), publishing to the SAME
  // `orchestrion:pg:query`/`:connect` channels as the JS client.
  {
    channelName: 'query',
    module: { name: 'pg', versionRange: '>=8.0.3 <9', filePath: 'lib/native/client.js' },
    functionQuery: { expressionName: 'query', kind: 'Auto' },
  },
  {
    channelName: 'connect',
    module: { name: 'pg', versionRange: '>=8.0.3 <9', filePath: 'lib/native/client.js' },
    functionQuery: { expressionName: 'connect', kind: 'Auto' },
  },
  // `pg-pool` is `class Pool extends EventEmitter { connect(cb) {...} }`.
  {
    channelName: 'connect',
    module: { name: 'pg-pool', versionRange: '>=2.0.0 <4', filePath: 'index.js' },
    functionQuery: { className: 'Pool', methodName: 'connect', kind: 'Auto' },
  },
] satisfies InstrumentationConfig[];

export const pgModuleNames = getModuleNames(pgConfig);

export const pgChannels = {
  PG_QUERY: 'orchestrion:pg:query',
  PG_CONNECT: 'orchestrion:pg:connect',
  PGPOOL_CONNECT: 'orchestrion:pg-pool:connect',
} as const;
