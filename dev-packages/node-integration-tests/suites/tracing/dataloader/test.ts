import {
  CACHE_KEY,
  CACHE_OPERATION,
  DB_COLLECTION_NAME,
  DB_OPERATION_NAME,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { CACHE_GET, CACHE_PUT, CACHE_REMOVE } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// The span origin depends on which instrumentation is active. When the generic orchestrion run is
// enabled (via INJECT_ORCHESTRION) the OTel `Dataloader` integration is swapped for the
// diagnostics-channel one, which stamps a different origin.
const ORIGIN = 'auto.db.dataloader';
const CACHE_MUTATION_OPS = { prime: CACHE_PUT, clear: CACHE_REMOVE, clearAll: CACHE_REMOVE } as const;

describe('dataloader auto-instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('instruments load, loadMany, batch, prime, clear and clearAll', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('GET /load');

            const spans = container.items;

            const loadSpan = spans.find(span => span.attributes[DB_OPERATION_NAME]?.value === 'load');
            expect(loadSpan).toBeDefined();
            expect(loadSpan?.attributes[SENTRY_OP]?.value).toBe(CACHE_GET);
            expect(loadSpan?.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(loadSpan?.status).toBe('ok');
            expect(loadSpan?.attributes[CACHE_KEY]?.value).toEqual(['user-1']);
            expect(loadSpan?.attributes[DB_OPERATION_NAME]?.value).toBe('load');
            // A direct operation is a client call; the deferred `batch` below gets no kind
            expect(loadSpan?.attributes[SENTRY_KIND]?.value).toBe('client');

            const batchSpan = spans.find(span => span.attributes[DB_OPERATION_NAME]?.value === 'batch');
            expect(batchSpan).toBeDefined();
            expect(batchSpan?.attributes[SENTRY_OP]?.value).toBe(CACHE_GET);
            expect(batchSpan?.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(batchSpan?.status).toBe('ok');
            expect(batchSpan?.attributes[CACHE_KEY]?.value).toEqual(['user-1']);
            expect(batchSpan?.attributes[SENTRY_KIND]?.value).toBeUndefined();

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
            expect(loadSpan?.end_timestamp).toBeGreaterThanOrEqual(batchSpan?.end_timestamp ?? 0);
          },
        })
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('GET /load-many');

            const loadManySpan = container.items.find(span => span.attributes[DB_OPERATION_NAME]?.value === 'loadMany');
            expect(loadManySpan).toBeDefined();
            expect(loadManySpan?.attributes[SENTRY_OP]?.value).toBe(CACHE_GET);
            expect(loadManySpan?.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(loadManySpan?.status).toBe('ok');
            expect(loadManySpan?.attributes[CACHE_KEY]?.value).toEqual(['user-1', 'user-2']);
          },
        })
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('GET /cache-ops');

            const spans = container.items;

            // prime writes to the cache, clear/clearAll remove from it
            for (const [operation, op] of Object.entries(CACHE_MUTATION_OPS)) {
              const span = spans.find(s => s.attributes[DB_OPERATION_NAME]?.value === operation);
              expect(span, `expected a dataloader.${operation} span`).toBeDefined();
              expect(span?.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
              expect(span?.status).toBe('ok');
              expect(span?.name).toBe(op);
              expect(span?.attributes[SENTRY_OP]?.value).toBe(op);
              expect(span?.attributes[DB_OPERATION_NAME]?.value).toBe(operation);
            }

            // `clearAll` takes no key, the other two act on a single key
            expect(
              spans.find(s => s.attributes[DB_OPERATION_NAME]?.value === 'prime')?.attributes[CACHE_KEY]?.value,
            ).toEqual(['user-1']);
            expect(
              spans.find(s => s.attributes[DB_OPERATION_NAME]?.value === 'clear')?.attributes[CACHE_KEY]?.value,
            ).toEqual(['user-1']);
            expect(
              spans.find(s => s.attributes[DB_OPERATION_NAME]?.value === 'clearAll')?.attributes[CACHE_KEY]?.value,
            ).toBeUndefined();
          },
        })
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment)?.name).toBe('GET /named');

            const namedLoadSpan = container.items.find(span => span.attributes[DB_OPERATION_NAME]?.value === 'load');
            expect(namedLoadSpan).toBeDefined();
            expect(namedLoadSpan?.attributes[SENTRY_OP]?.value).toBe(CACHE_GET);
            expect(namedLoadSpan?.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(namedLoadSpan?.status).toBe('ok');
            expect(namedLoadSpan?.name).toBe(CACHE_GET);
            expect(namedLoadSpan?.attributes[CACHE_OPERATION]?.value).toBe('get');
            expect(namedLoadSpan?.attributes[DB_COLLECTION_NAME]?.value).toBe('usersLoader');
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
