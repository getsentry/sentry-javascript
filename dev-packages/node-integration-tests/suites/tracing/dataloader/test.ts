import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// The span origin depends on which instrumentation is active. When the generic orchestrion run is
// enabled (via INJECT_ORCHESTRION) the OTel `Dataloader` integration is swapped for the
// diagnostics-channel one, which stamps a different origin.
const ORIGIN = 'auto.db.dataloader';
const CACHE_GET_OP = 'cache.get';
const CACHE_MUTATION_OPS = { prime: 'cache.put', clear: 'cache.remove', clearAll: 'cache.remove' } as const;

describe('dataloader auto-instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('instruments load, loadMany, batch, prime, clear and clearAll', async () => {
      const runner = createRunner()
        .expect({
          transaction: event => {
            expect(event.transaction).toBe('GET /load');

            const spans = event.spans || [];

            const loadSpan = spans.find(span => span.description === 'dataloader.load');
            expect(loadSpan).toBeDefined();
            expect(loadSpan?.op).toBe(CACHE_GET_OP);
            expect(loadSpan?.origin).toBe(ORIGIN);
            expect(loadSpan?.status).toBe('ok');
            expect(loadSpan?.data?.['sentry.origin']).toBe(ORIGIN);
            expect(loadSpan?.data?.['sentry.op']).toBe(CACHE_GET_OP);
            expect(loadSpan?.data?.['cache.key']).toEqual(['user-1']);
            expect(loadSpan?.data?.['db.operation.name']).toBe('load');
            // A direct operation is a client call; the deferred `batch` below gets no kind
            expect(loadSpan?.data?.['sentry.kind']).toBe('client');

            const batchSpan = spans.find(span => span.description === 'dataloader.batch');
            expect(batchSpan).toBeDefined();
            expect(batchSpan?.op).toBe(CACHE_GET_OP);
            expect(batchSpan?.origin).toBe(ORIGIN);
            expect(batchSpan?.status).toBe('ok');
            expect(batchSpan?.data?.['cache.key']).toEqual(['user-1']);
            expect(batchSpan?.data?.['sentry.kind']).toBeUndefined();

            // The batch span links back to the load span that triggered it
            expect(batchSpan?.links).toEqual([
              expect.objectContaining({
                trace_id: loadSpan?.trace_id,
                span_id: loadSpan?.span_id,
              }),
            ]);

            // Locks down the async behavior: `load` encloses the deferred `batch` span
            expect(batchSpan?.parent_span_id).toBe(loadSpan?.span_id);
            expect(loadSpan?.start_timestamp).toBeLessThanOrEqual(batchSpan?.start_timestamp ?? 0);
            expect(loadSpan?.timestamp).toBeGreaterThanOrEqual(batchSpan?.timestamp ?? 0);
          },
        })
        .expect({
          transaction: event => {
            expect(event.transaction).toBe('GET /load-many');

            const loadManySpan = (event.spans || []).find(span => span.description === 'dataloader.loadMany');
            expect(loadManySpan).toBeDefined();
            expect(loadManySpan?.op).toBe(CACHE_GET_OP);
            expect(loadManySpan?.origin).toBe(ORIGIN);
            expect(loadManySpan?.status).toBe('ok');
            expect(loadManySpan?.data?.['sentry.origin']).toBe(ORIGIN);
            expect(loadManySpan?.data?.['sentry.op']).toBe(CACHE_GET_OP);
            expect(loadManySpan?.data?.['cache.key']).toEqual(['user-1', 'user-2']);
          },
        })
        .expect({
          transaction: event => {
            expect(event.transaction).toBe('GET /cache-ops');

            const spans = event.spans || [];

            // prime writes to the cache, clear/clearAll remove from it
            for (const [operation, op] of Object.entries(CACHE_MUTATION_OPS)) {
              const span = spans.find(s => s.description === `dataloader.${operation}`);
              expect(span, `expected a dataloader.${operation} span`).toBeDefined();
              expect(span?.origin).toBe(ORIGIN);
              expect(span?.status).toBe('ok');
              expect(span?.op).toBe(op);
              expect(span?.data?.['sentry.origin']).toBe(ORIGIN);
              expect(span?.data?.['db.operation.name']).toBe(operation);
            }

            // `clearAll` takes no key, the other two act on a single key
            expect(spans.find(s => s.description === 'dataloader.prime')?.data?.['cache.key']).toEqual(['user-1']);
            expect(spans.find(s => s.description === 'dataloader.clear')?.data?.['cache.key']).toEqual(['user-1']);
            expect(spans.find(s => s.description === 'dataloader.clearAll')?.data?.['cache.key']).toBeUndefined();
          },
        })
        .expect({
          transaction: event => {
            expect(event.transaction).toBe('GET /named');

            // A named dataloader includes its name in the span description
            const namedLoadSpan = (event.spans || []).find(span => span.description === 'dataloader.load usersLoader');
            expect(namedLoadSpan).toBeDefined();
            expect(namedLoadSpan?.op).toBe(CACHE_GET_OP);
            expect(namedLoadSpan?.origin).toBe(ORIGIN);
            expect(namedLoadSpan?.status).toBe('ok');
          },
        })
        .start();

      await runner.makeRequest('get', '/load');
      await runner.makeRequest('get', '/load-many');
      await runner.makeRequest('get', '/cache-ops');
      await runner.makeRequest('get', '/named');
      await runner.completed();
    }, 30_000);
  });
});
