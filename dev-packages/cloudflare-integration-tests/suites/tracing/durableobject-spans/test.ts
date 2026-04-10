import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// Regression test for https://github.com/getsentry/sentry-javascript/issues/20030
// When a Durable Object method calls Sentry.startSpan multiple times, those spans
// must appear as children of the DO transaction. The first invocation always worked;
// the second invocation on the same DO instance previously lost its child spans
// because the client was disposed after the first call.
// TODO: unskip - this test is flaky, timing out in CI
it.skip('sends child spans on repeated Durable Object calls', async ({ signal }) => {
  function assertDoWorkEnvelope(envelope: unknown): void {
    const transactionEvent = (envelope as any)[1]?.[0]?.[1];

    expect(transactionEvent).toEqual(
      expect.objectContaining({
        transaction: 'doWork',
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            op: 'rpc',
            origin: 'auto.faas.cloudflare.durable_object',
          }),
        }),
      }),
    );

    // All 5 child spans should be present
    expect(transactionEvent.spans).toHaveLength(5);
    expect(transactionEvent.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: 'task-1', op: 'task' }),
        expect.objectContaining({ description: 'task-2', op: 'task' }),
        expect.objectContaining({ description: 'task-3', op: 'task' }),
        expect.objectContaining({ description: 'task-4', op: 'task' }),
        expect.objectContaining({ description: 'task-5', op: 'task' }),
      ]),
    );

    // All child spans share the root trace_id
    const rootTraceId = transactionEvent.contexts?.trace?.trace_id;
    expect(rootTraceId).toBeDefined();
    for (const span of transactionEvent.spans) {
      expect(span.trace_id).toBe(rootTraceId);
    }
  }

  // Expect 5 transaction envelopes — one per call.
  const runner = createRunner(__dirname).expectN(5, assertDoWorkEnvelope).start(signal);

  // Small delay between requests to allow waitUntil to process in wrangler dev.
  // This is needed because wrangler dev may not guarantee waitUntil completion
  // the same way production Cloudflare does. Without this delay, the last
  // envelope's HTTP request may not complete before the test moves on.
  const delay = () => new Promise(resolve => setTimeout(resolve, 50));

  await runner.makeRequest('get', '/');
  await delay();
  await runner.makeRequest('get', '/');
  await delay();
  await runner.makeRequest('get', '/');
  await delay();
  await runner.makeRequest('get', '/');
  await delay();
  await runner.makeRequest('get', '/');
  await runner.completed();
});
