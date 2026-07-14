import { tracingChannel } from 'node:diagnostics_channel';

const CHANNEL = 'orchestrion:mysql:query';

// The SDK only activates a channel subscriber whose module the orchestrion code
// transform actually processed, per the `transformedModules` list the bundler
// plugin records on the marker. Since `mysql` can't be bundled in workerd (see
// the note on `runQuery` below), the transform never sees it, so we simulate
// that list entry here — the same simulation the rest of this worker performs
// for the query itself. Without it, the mysql subscriber is narrowed out and no
// `db` span is ever created.
declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_ORCHESTRION__: { transformedModules?: string[] } | undefined;
}
globalThis.__SENTRY_ORCHESTRION__ = globalThis.__SENTRY_ORCHESTRION__ || {};
globalThis.__SENTRY_ORCHESTRION__.transformedModules = [
  ...(globalThis.__SENTRY_ORCHESTRION__.transformedModules || []),
  'mysql',
];

interface Config {
  host: string;
  port: number;
  database: string;
  user: string;
}

// Plain worker — no manual `Sentry.withSentry` wrapping. The
// `@sentry/cloudflare/vite` plugin injects the wrapper at build time using the
// options from `instrument.server.ts`.
//
// The handlers simulate what the plugin's orchestrion transform does to
// `mysql`'s `Connection.prototype.query`: it wraps the call in
// `tracingChannel('orchestrion:mysql:query').traceCallback(...)`, which drives
// the start/asyncStart/asyncEnd lifecycle AND the span-store binding the SDK's
// channel subscriber hooks into (raw `channel.publish()` would not run that
// binding, so no span would be created). The real `mysql` package can't load in
// workerd (no `node:net`), so a fake async callback stands in for the query
// while exercising the exact same channel machinery.
function runQuery(sql: string, config: Config): Promise<void> {
  const channel = tracingChannel(CHANNEL);
  const connection = { config };
  return new Promise<void>((resolve, reject) => {
    channel.traceCallback(
      (cb: (err: unknown) => void) => queueMicrotask(() => cb(null)),
      0,
      { arguments: [sql], self: connection },
      connection,
      (err: unknown) => (err ? reject(err) : resolve()),
    );
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const config: Config = { host: '127.0.0.1', port: 3306, database: 'testdb', user: 'root' };

    if (url.pathname === '/test-mysql-channel') {
      await runQuery('SELECT 1 + 1 AS solution', config);
      return Response.json({ status: 'ok' });
    }

    if (url.pathname === '/test-nested-mysql-channel') {
      // Second query runs inside the first's callback — proves the parent span
      // context is restored across the async boundary so both `db` spans land on
      // the same `http.server` transaction.
      const channel = tracingChannel(CHANNEL);
      const connection = { config };
      await new Promise<void>((resolve, reject) => {
        channel.traceCallback(
          (cb: (err: unknown) => void) => queueMicrotask(() => cb(null)),
          0,
          { arguments: ['SELECT 1 + 1 AS solution'], self: connection },
          connection,
          (err: unknown) => {
            if (err) return reject(err);
            runQuery('SELECT NOW()', config).then(resolve, reject);
          },
        );
      });
      return Response.json({ status: 'ok' });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
