// Spawned by test.ts via `deno run`, without `@sentry/deno/import`.
//
// `init()` registers the orchestrion module hook, so the `@orpc/server` import that follows it is
// transformed to publish to the `orchestrion:@orpc/server:executeProcedure` tracing channel.
import { init, flush, startSpan } from '@sentry/deno';
import { getSpanOp, spanSink } from '../../src/index.ts';

const sink = spanSink();
const errors: unknown[] = [];

init({
  dsn: 'https://username@domain/123',
  tracesSampleRate: 1,
  transport: sink.transport,
  beforeSend: event => {
    const exception = event.exception?.values?.[0];
    errors.push({ value: exception?.value, mechanism: exception?.mechanism, transaction: event.transaction });
    return null;
  },
});

const { ORPCError, os } = await import('@orpc/server');
const { RPCHandler } = await import('@orpc/server/fetch');

const handler = new RPCHandler({
  planet: {
    find: os.handler(() => ({ name: 'Earth' })),
    crash: os.handler(() => {
      throw new Error('Sentry Test Error');
    }),
    missing: os.handler(() => {
      throw new ORPCError('NOT_FOUND');
    }),
  },
});

for (const procedure of ['find', 'missing', 'crash']) {
  await startSpan({ name: 'POST /rpc', op: 'http.server' }, () =>
    handler.handle(new Request(`http://localhost/rpc/planet/${procedure}`, { method: 'POST', body: '{}' }), {
      prefix: '/rpc',
    }),
  );
}

await flush();

console.log(
  `SCENARIO ${JSON.stringify({
    spans: sink.spans.map(span => ({
      name: span.name,
      op: getSpanOp(span),
      origin: span.attributes['sentry.origin']?.value,
      is_segment: span.is_segment,
    })),
    errors,
  })}`,
);
