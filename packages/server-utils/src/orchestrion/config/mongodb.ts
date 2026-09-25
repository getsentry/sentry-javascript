import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// The mongodb driver's command architecture changed across majors, mirrored in the vendored OTel
// instrumentation's version bands:
//   - >= 6.4: promise-based `Connection.prototype.command`
//   - >= 4.0 < 6.4: callback-based `Connection.prototype.command` + `ConnectionPool.checkOut`
//     (the pool runs the checkout callback in a detached context, so the channel re-propagates the
//     caller's async context to it — see the subscriber)
//   - >= 3.3 < 4: the `lib/core/wireprotocol` module functions
const module = { name: 'mongodb' } as const;

export const mongodbConfig = [
  // Band 1: mongodb >= 6.4 — promise-based command.
  // `methodName`-only (no `className`): the code-transformer's `className` matcher throws on classes
  // containing ES2022 `static {}` blocks (mongodb 7.x's `Connection`/`ConnectionPool` have them — see
  // `transformer-bug.md`), and `methodName` alone matches exactly the base method across all versions.
  {
    channelName: 'command',
    module: { ...module, versionRange: '>=6.4.0 <8', filePath: 'lib/cmap/connection.js' },
    functionQuery: { methodName: 'command', kind: 'Async' },
  },
  // Band 2: mongodb >= 4.0 < 6.4 — callback-based command (same `command` channel, different kind).
  {
    channelName: 'command',
    module: { ...module, versionRange: '>=4.0.0 <6.4', filePath: 'lib/cmap/connection.js' },
    functionQuery: { methodName: 'command', kind: 'Callback' },
  },
  // Band 2: the pool runs the checkout callback in a detached async context, so the operation's
  // `command()` (invoked inside it) loses the caller's active span. Hooking `checkOut` re-propagates
  // that context to the callback (the subscriber creates no span — see `getSpan` returning undefined).
  // Only needed < 6.4; from 6.4 `checkOut` is promise-based and the context survives natively.
  {
    channelName: 'checkout',
    module: { ...module, versionRange: '>=4.0.0 <6.4', filePath: 'lib/cmap/connection_pool.js' },
    functionQuery: { methodName: 'checkOut', kind: 'Callback' },
  },
  // Band 3: mongodb >= 3.3 < 4 — the driver had no unified `command`; each operation is a separate
  // `lib/core/wireprotocol` function, all callback-style. `insert`/`update`/`remove` are named
  // function expressions in the `index.js` `module.exports` object (matched by `expressionName`);
  // `command`/`query`/`getMore` are single-function modules (matched by `functionName`).
  ...(['insert', 'update', 'remove'] as const).map(op => ({
    channelName: `v3_${op}`,
    module: { ...module, versionRange: '>=3.3.0 <4', filePath: 'lib/core/wireprotocol/index.js' },
    functionQuery: { expressionName: op, kind: 'Callback' as const },
  })),
  {
    channelName: 'v3_command',
    module: { ...module, versionRange: '>=3.3.0 <4', filePath: 'lib/core/wireprotocol/command.js' },
    functionQuery: { functionName: 'command', kind: 'Callback' },
  },
  {
    channelName: 'v3_query',
    module: { ...module, versionRange: '>=3.3.0 <4', filePath: 'lib/core/wireprotocol/query.js' },
    functionQuery: { functionName: 'query', kind: 'Callback' },
  },
  {
    channelName: 'v3_get_more',
    module: { ...module, versionRange: '>=3.3.0 <4', filePath: 'lib/core/wireprotocol/get_more.js' },
    functionQuery: { functionName: 'getMore', kind: 'Callback' },
  },
] satisfies InstrumentationConfig[];

export const mongodbModuleNames = getModuleNames(mongodbConfig);

export const mongodbChannels = {
  MONGODB_COMMAND: 'orchestrion:mongodb:command',
  MONGODB_CHECKOUT: 'orchestrion:mongodb:checkout',
  MONGODB_V3_INSERT: 'orchestrion:mongodb:v3_insert',
  MONGODB_V3_UPDATE: 'orchestrion:mongodb:v3_update',
  MONGODB_V3_REMOVE: 'orchestrion:mongodb:v3_remove',
  MONGODB_V3_COMMAND: 'orchestrion:mongodb:v3_command',
  MONGODB_V3_QUERY: 'orchestrion:mongodb:v3_query',
  MONGODB_V3_GET_MORE: 'orchestrion:mongodb:v3_get_more',
} as const;
