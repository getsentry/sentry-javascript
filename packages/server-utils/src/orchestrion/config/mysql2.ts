import type { InstrumentationConfig } from '..';
import { toSubscribeInjections } from './subscribe-injection';

// Ports `@opentelemetry/instrumentation-mysql2` (which patches `query`/`execute` on the connection
// prototype) to orchestrion channel injection.
//
// Two file layouts across the supported range:
//   - `< 3.11.5`  → `class Connection` with `query`/`execute` in `lib/connection.js`
//   - `>= 3.11.5` → the methods moved to `class BaseConnection` in `lib/base/connection.js`
//
// Gated to `< 3.20.0`: from 3.20.0 mysql2 publishes to `node:diagnostics_channel` natively, and
// that path is instrumented by `subscribeMysql2DiagnosticChannels` instead. Injecting there too
// would emit two spans per query.
//
// `Callback` traces the callback shapes: `query(sql, cb)`, `query(sql, values, cb)`, and — since the
// promise API funnels through the callback form — `await connection.query(sql)`. `execute` never
// delegates to `query` internally, so instrumenting both is safe.
//
// NOT `Auto`: `Auto`'s no-callback branch probes the return value for `.then`, but mysql2's callback-
// less `query(sql)` returns a `Query` whose `.then()` throws (mysql2's "use the promise wrapper"
// guard) — so `Auto` would crash streamed queries. `Callback` leaves that shape untouched (a rare,
// row-streaming use that consumes the emitter's events), the tradeoff being it isn't traced.
export const mysql2Config = [
  {
    channelName: 'query',
    module: { name: 'mysql2', versionRange: '>=1.4.2 <3.11.5', filePath: 'lib/connection.js' },
    functionQuery: { className: 'Connection', methodName: 'query', kind: 'Callback' },
  },
  {
    channelName: 'execute',
    module: { name: 'mysql2', versionRange: '>=1.4.2 <3.11.5', filePath: 'lib/connection.js' },
    functionQuery: { className: 'Connection', methodName: 'execute', kind: 'Callback' },
  },
  {
    channelName: 'query',
    module: { name: 'mysql2', versionRange: '>=3.11.5 <3.20.0', filePath: 'lib/base/connection.js' },
    functionQuery: { className: 'BaseConnection', methodName: 'query', kind: 'Callback' },
  },
  {
    channelName: 'execute',
    module: { name: 'mysql2', versionRange: '>=3.11.5 <3.20.0', filePath: 'lib/base/connection.js' },
    functionQuery: { className: 'BaseConnection', methodName: 'execute', kind: 'Callback' },
  },
] satisfies InstrumentationConfig[];

export const mysql2Channels = {
  MYSQL2_QUERY: 'orchestrion:mysql2:query',
  MYSQL2_EXECUTE: 'orchestrion:mysql2:execute',
} as const;

export const mysql2SubscribeInjection = toSubscribeInjections(mysql2Config);
