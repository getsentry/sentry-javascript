// Spawned by test.ts via `deno run`, without `@sentry/deno/import`.
//
// `init()` registers the orchestrion module hook, so the `mysql` import that
// follows it is transformed to publish to the `orchestrion:mysql:query`
// tracing channel. Pass `disabled` to opt out with
// `enableRuntimeChannelInjection: false`.
import { init } from '@sentry/deno';
import { tracingChannel } from 'node:diagnostics_channel';

init({
  debug: true,
  enableRuntimeChannelInjection: Deno.args[0] !== 'disabled',
});

const { default: mysql } = await import('mysql');

const events = [];
tracingChannel('orchestrion:mysql:query').subscribe({
  start() {
    events.push('start');
  },
  end() {},
  asyncStart() {},
  asyncEnd() {},
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
console.log(`SCENARIO events=${events.join(',')} marker=${JSON.stringify(marker)}`);
