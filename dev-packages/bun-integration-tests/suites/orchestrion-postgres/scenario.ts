// Bundled entry for the `bun build` smoke test.
//
// Once `Bun.build` (with the orchestrion plugin) has transformed `pg`,
// calling `client.query()` publishes to the `orchestrion:pg:query` tracing
// channel.
//
// `start` fires synchronously on the call, so no live database is needed.
//
// We subscribe, run a query, and report which channel events fired
// (plus the detection marker the plugin's banner sets at boot).

import { tracingChannel } from 'node:diagnostics_channel';

// @ts-ignore -- only the runtime value is needed; pg's types are irrelevant
import pg from 'pg';

interface QueryContext {
  arguments?: unknown[];
}
interface Client {
  query(sql: string, cb: () => void): void;
}
interface PgModule {
  Client: new (opts: { host: string; user: string; database: string }) => Client;
}

const events: string[] = [];
let statement = '';

tracingChannel('orchestrion:pg:query').subscribe({
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

const client = new (pg as PgModule).Client({ host: '127.0.0.1', user: 'root', database: 'mydb' });
try {
  client.query('SELECT 1 AS solution', () => {});
} catch {
  // No live server
  // `start` has already published synchronously by this point.
}

const marker = (globalThis as { __SENTRY_ORCHESTRION__?: { runtime?: boolean; bundler?: boolean } })
  .__SENTRY_ORCHESTRION__;

setTimeout(() => {
  // eslint-disable-next-line no-console
  console.log(`SCENARIO events=${events.join(',')} statement=${statement} marker=${JSON.stringify(marker ?? null)}`);
  process.exit(0);
}, 200);
