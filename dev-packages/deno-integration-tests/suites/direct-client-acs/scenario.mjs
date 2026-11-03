// Spawned by test.ts via `deno run`, in a fresh process so nothing else has
// installed the AsyncLocalStorage context strategy.
//
// This builds a `DenoClient` DIRECTLY — `new DenoClient(...)` + `client.init()`
// instead of calling `Sentry.init()`, then drives the mysql orchestrion channel
// The mysql subscriber only binds once the ALS context strategy is installed
// (it waits for the tracing-channel binding), so a nested db span here proves
// `DenoClient.init()` installs that strategy on the direct-construction path.
// Without it, the subscriber never binds and no span is produced.
import { createStackParser } from '@sentry/core';
import { nodeStackLineParser } from '@sentry/core/server';
import { DenoClient, getCurrentScope, getDefaultIntegrations, startSpan } from '@sentry/deno';
import { tracingChannel } from 'node:diagnostics_channel';

const spans = [];

const client = new DenoClient({
  dsn: 'https://username@domain/123',
  tracesSampleRate: 1,
  integrations: getDefaultIntegrations({ tracesSampleRate: 1 }),
  stackParser: createStackParser(nodeStackLineParser()),
  transport: () => ({
    send(envelope) {
      for (const [header, payload] of envelope[1]) {
        if (header.type === 'span') {
          spans.push(...payload.items);
        }
      }
      return Promise.resolve({});
    },
    flush: () => Promise.resolve(true),
  }),
});

client.init();
getCurrentScope().setClient(client);

const channel = tracingChannel('orchestrion:mysql:query');
const ctx = {
  arguments: ['SELECT 1 AS solution'],
  self: { config: { host: '127.0.0.1', port: 3306, database: 'mydb', user: 'root' } },
};

startSpan({ name: 'parent', op: 'test' }, () => {
  channel.start.runStores(ctx, () => {
    channel.end.publish(ctx);
  });
  channel.asyncStart.runStores(ctx, () => {
    channel.asyncEnd.publish(ctx);
  });
});

await client.flush(2000);

const parent = spans.find(span => span.is_segment && span.name === 'parent');
const nested = spans.some(
  span =>
    span.attributes['sentry.op']?.value === 'db' &&
    span.attributes['sentry.origin']?.value === 'auto.db.mysql' &&
    span.parent_span_id === parent?.span_id &&
    span.trace_id === parent?.trace_id,
);

// eslint-disable-next-line no-console
console.log(`SCENARIO nested=${nested}`);
