import { tracingChannel } from 'node:diagnostics_channel';

// Plain worker — no manual `Sentry.withSentry` wrapping. The
// `@sentry/cloudflare/vite` plugin injects the wrapper at build time using the
// options from `instrument.server.ts`.
//
// The handler simulates the `orchestrion:mysql:query` channel events that the
// orchestrion code transform would inject into `mysql/lib/Connection.js`. We
// fire the channel manually so the e2e test can run without a live MySQL server
// or the `mysql` npm package (which requires `node:net`, unavailable in workerd).
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/test-mysql-channel') {
      const channel = tracingChannel('orchestrion:mysql:query');

      // Mirrors the context shape orchestrion's wrapCallback/wrapAuto
      // transform publishes. `arguments[0]` is the SQL statement;
      // `self.config` is the mysql connection's config object.
      const ctx = {
        arguments: ['SELECT 1 + 1 AS solution'],
        self: {
          config: {
            host: '127.0.0.1',
            port: 3306,
            database: 'testdb',
            user: 'root',
          },
        },
      };

      // Callback-success lifecycle: start → end → asyncStart → asyncEnd.
      channel.start.publish(ctx);
      channel.end.publish(ctx);
      channel.asyncStart.publish(ctx);
      channel.asyncEnd.publish(ctx);

      return Response.json({ status: 'ok' });
    }

    if (url.pathname === '/test-nested-mysql-channel') {
      const channel = tracingChannel('orchestrion:mysql:query');

      const config = {
        host: '127.0.0.1',
        port: 3306,
        database: 'testdb',
        user: 'root',
      };

      // First query — fires its full lifecycle synchronously.
      const ctx1 = {
        arguments: ['SELECT 1 + 1 AS solution'],
        self: { config },
      };
      channel.start.publish(ctx1);
      channel.end.publish(ctx1);
      channel.asyncStart.publish(ctx1);
      channel.asyncEnd.publish(ctx1);

      // Second (nested) query — runs inside the first query's "callback".
      // Proves the context strategy restores the parent span.
      const ctx2 = {
        arguments: ['SELECT NOW()'],
        self: { config },
      };
      channel.start.publish(ctx2);
      channel.end.publish(ctx2);
      channel.asyncStart.publish(ctx2);
      channel.asyncEnd.publish(ctx2);

      return Response.json({ status: 'ok' });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
