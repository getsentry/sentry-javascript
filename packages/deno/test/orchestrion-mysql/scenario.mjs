// Spawned by orchestrion-mysql.test.ts via `deno run`.
//
// Importing `@sentry/deno/import` FIRST registers the orchestrion module hook,
// so the subsequent `mysql` import is transformed to publish to the
// `orchestrion:mysql:query` tracing channel. `connection.query()` publishes
// `start` synchronously, so no live database is needed.
import '@sentry/deno/import';

import { tracingChannel } from 'node:diagnostics_channel';
const { default: mysql } = await import('mysql');

const events = [];
let statement = '';

tracingChannel('orchestrion:mysql:query').subscribe({
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

const conn = mysql.createConnection({ host: '127.0.0.1', user: 'root' });
try {
  conn.query('SELECT 1 AS solution', () => {});
} catch {
  // No live server — `start` has already published synchronously by now.
}
try {
  conn.destroy();
} catch {
  // ignore
}

const marker = globalThis.__SENTRY_ORCHESTRION__ ?? null;
// eslint-disable-next-line no-console
console.log(`SCENARIO events=${events.join(',')} statement=${statement} marker=${JSON.stringify(marker)}`);
