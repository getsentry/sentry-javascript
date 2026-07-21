// Bundled entry for the `bun build` smoke test.
//
// Once `Bun.build` (with the orchestrion plugin) has transformed `mysql`,
// calling `connection.query()` publishes to the `orchestrion:mysql:query`
// tracing channel.
//
// `start` fires synchronously on the call, so no live database is needed.
//
// We subscribe, run a query, and report which channel events fired
// (plus the detection marker the plugin's banner sets at boot).

import { tracingChannel } from 'node:diagnostics_channel';

// @ts-ignore -- `mysql` ships no type declarations; only needed at runtime.
import mysql from 'mysql';

interface QueryContext {
  arguments?: unknown[];
}
interface Connection {
  query(sql: string, cb: () => void): void;
  destroy(): void;
}
interface MysqlModule {
  createConnection(opts: { host: string; user: string }): Connection;
}

const events: string[] = [];
let statement = '';

tracingChannel('orchestrion:mysql:query').subscribe({
  start(message: unknown) {
    events.push('start');
    const first = (message as QueryContext).arguments?.[0];
    statement = typeof first === 'string' ? first : '';
  },
  end() {
    events.push('end');
  },
  asyncStart() {},
  asyncEnd() {
    events.push('asyncEnd');
  },
  error() {},
});

const conn = (mysql as MysqlModule).createConnection({ host: '127.0.0.1', user: 'root' });
try {
  conn.query('SELECT 1 AS solution', () => {});
} catch {
  // No live server — `start` has already published synchronously by this point.
}
try {
  conn.destroy();
} catch {
  // ignore
}

const marker = (globalThis as { __SENTRY_ORCHESTRION__?: { runtime?: boolean; bundler?: boolean } })
  .__SENTRY_ORCHESTRION__;

setTimeout(() => {
  // eslint-disable-next-line no-console
  console.log(`SCENARIO events=${events.join(',')} statement=${statement} marker=${JSON.stringify(marker ?? null)}`);
  process.exit(0);
}, 200);
