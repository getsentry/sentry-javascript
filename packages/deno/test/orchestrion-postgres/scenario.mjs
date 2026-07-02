// Spawned by orchestrion-postgres.test.ts via `deno run`.
//
// Importing `@sentry/deno/import` FIRST registers the orchestrion module hook,
// so the subsequent `pg` import is transformed to publish to the
// `orchestrion:pg:query` tracing channel. `client.query()` publishes `start`
// synchronously, so no live database is needed.
import '@sentry/deno/import';

import { tracingChannel } from 'node:diagnostics_channel';
const { default: pg } = await import('pg');

const events = [];
let statement = '';

tracingChannel('orchestrion:pg:query').subscribe({
  start(message) {
    events.push('start');
    const first = message?.arguments?.[0];
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

const client = new pg.Client({ host: '127.0.0.1', user: 'root', database: 'mydb' });
try {
  client.query('SELECT 1 AS solution', () => {});
} catch {
  // No live server, `start` has already published synchronously by now.
}

const marker = globalThis.__SENTRY_ORCHESTRION__ ?? null;
// eslint-disable-next-line no-console
console.log(`SCENARIO events=${events.join(',')} statement=${statement} marker=${JSON.stringify(marker)}`);
