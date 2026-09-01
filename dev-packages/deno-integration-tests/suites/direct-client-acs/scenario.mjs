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

let nested = false;

const client = new DenoClient({
  dsn: 'https://username@domain/123',
  tracesSampleRate: 1,
  traceLifecycle: 'static',
  integrations: getDefaultIntegrations({}),
  stackParser: createStackParser(nodeStackLineParser()),
  beforeSendTransaction(event) {
    const spans = event.spans ?? [];
    if (spans.some(s => s.op === 'db' && s.data?.['sentry.origin'] === 'auto.db.mysql')) {
      nested = true;
    }
    return null;
  },
  transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
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

// eslint-disable-next-line no-console
console.log(`SCENARIO nested=${nested}`);
