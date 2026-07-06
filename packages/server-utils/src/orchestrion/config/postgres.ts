import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

// postgres.js (`postgres` npm package, v3.x). Named after the npm package;
// `postgres` doesn't collide with `pg.ts` (that file instruments `pg`/`pg-pool`).
//
// The ESM build lives under `src/*`, the CJS build under `cjs/src/*` (the
// `cf/*` workerd build has no channel subscribers, see the integration).
// Both builds share the same class/function shapes, so a single `flatMap`
// over the two dirs emits one entry per (dir, target).
const postgresJsInstrumentationConfig = (dir: string): InstrumentationConfig[] => [
  // `Query.prototype.handle` (`class Query extends Promise`) is the single
  // funnel every query passes through (`then`/`catch`/`finally`/`.execute()`/
  // `.forEach()`/cursor all call it), guarded by `this.executed`. `Async`
  // because `handle` is `async`.
  {
    channelName: 'handle',
    module: { name: 'postgres', versionRange: '>=3.0.0 <4', filePath: `${dir}/query.js` },
    functionQuery: { className: 'Query', methodName: 'handle', kind: 'Async' },
  },
  // `function Connection(options, ...)` (default export of `connection.js`)
  // returns the connection object; used to build the endpoint registry that
  // resolves `server.address`/`server.port`/`db.namespace`.
  {
    channelName: 'connection',
    module: { name: 'postgres', versionRange: '>=3.0.0 <4', filePath: `${dir}/connection.js` },
    functionQuery: { functionName: 'Connection', kind: 'Sync' },
  },
  // The nested `function execute(q)` inside `Connection`; the per-connection
  // hook that attaches connection attributes to the query's span.
  {
    channelName: 'execute',
    module: { name: 'postgres', versionRange: '>=3.0.0 <4', filePath: `${dir}/connection.js` },
    functionQuery: { functionName: 'execute', kind: 'Sync' },
  },
];

export const postgresJsConfig = ['src', 'cjs/src'].flatMap(postgresJsInstrumentationConfig);

export const postgresJsChannels = {
  POSTGRESJS_HANDLE: 'orchestrion:postgres:handle',
  POSTGRESJS_CONNECTION: 'orchestrion:postgres:connection',
  POSTGRESJS_EXECUTE: 'orchestrion:postgres:execute',
} as const;
