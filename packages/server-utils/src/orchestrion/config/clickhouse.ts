import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `ClickHouseClient` sends every statement through four `async` methods: `query`, `command`, `exec`
// and `insert`. None of them calls another, so each call is traced as exactly one db span. `ping`
// and `close` carry no statement and are left alone.
//
// Two file layouts across the supported range:
//   - `< 1.23.0`  → the class lives in the separate `@clickhouse/client-common` package (`dist/client.js`)
//   - `>= 1.23.0` → `@clickhouse/client` ships that code itself, in `dist/common/client.js`
//
// Starts at 1.1.0: before it, `command` delegated to `exec` (two spans per command) and the client
// did not keep the `connectionParams` the span attributes are read from.
//
// The Node.js `NodeClickHouseClient` subclass only forwards `query` to `super`, and its class name
// doesn't match `className`, so it doesn't add a second span.
const METHODS = ['query', 'command', 'exec', 'insert'] as const;

const MODULES = [
  { name: '@clickhouse/client-common', versionRange: '>=1.1.0 <1.23.0', filePath: 'dist/client.js' },
  { name: '@clickhouse/client', versionRange: '>=1.23.0 <2', filePath: 'dist/common/client.js' },
];

export const clickhouseConfig: InstrumentationConfig[] = MODULES.flatMap(module =>
  METHODS.map(methodName => ({
    channelName: methodName,
    module,
    functionQuery: { className: 'ClickHouseClient', methodName, kind: 'Async' as const },
  })),
);

export const clickhouseModuleNames = getModuleNames(clickhouseConfig);

export const clickhouseChannels = {
  CLICKHOUSE_QUERY: 'orchestrion:@clickhouse/client:query',
  CLICKHOUSE_COMMAND: 'orchestrion:@clickhouse/client:command',
  CLICKHOUSE_EXEC: 'orchestrion:@clickhouse/client:exec',
  CLICKHOUSE_INSERT: 'orchestrion:@clickhouse/client:insert',
  CLICKHOUSE_COMMON_QUERY: 'orchestrion:@clickhouse/client-common:query',
  CLICKHOUSE_COMMON_COMMAND: 'orchestrion:@clickhouse/client-common:command',
  CLICKHOUSE_COMMON_EXEC: 'orchestrion:@clickhouse/client-common:exec',
  CLICKHOUSE_COMMON_INSERT: 'orchestrion:@clickhouse/client-common:insert',
} as const;
