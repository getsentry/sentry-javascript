import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmTests } from '../../../utils/runner';

const ORIGIN = { type: 'string', value: 'auto.rpc.orpc' };

const JSON_REQUEST = {
  headers: { 'content-type': 'application/json' },
  data: JSON.stringify({ json: { name: 'Earth' } }),
};

describe('oRPC integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // oRPC v2 is ESM-only.
  createEsmTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('records one span for a procedure call and names the transaction after the procedure', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe('planet/find');

            const orpcSpans = container.items.filter(item => item.attributes?.[SENTRY_ORIGIN]?.value === ORIGIN.value);
            expect(orpcSpans).toEqual([
              expect.objectContaining({
                name: 'planet/find',
                is_segment: false,
                attributes: expect.objectContaining({
                  [SENTRY_OP]: { type: 'string', value: 'rpc' },
                  [SENTRY_ORIGIN]: ORIGIN,
                  'rpc.system.name': { type: 'string', value: 'orpc' },
                  'rpc.method': { type: 'string', value: 'planet/find' },
                }),
              }),
            ]);
          },
        })
        .start();

      await runner.makeRequest('post', '/rpc/planet/find', JSON_REQUEST);
      await runner.completed();
    });

    test('captures errors thrown by procedures, but not 4xx ORPCErrors', async () => {
      const runner = createRunner()
        .ignore('span')
        .expect({
          event: {
            transaction: 'planet/crash',
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'Sentry Test Error',
                  mechanism: { type: 'auto.rpc.orpc', handled: false },
                },
              ],
            },
            contexts: {
              orpc: { procedure_path: 'planet/crash', input: { name: 'Earth' } },
              trace: {
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
              },
            },
          },
        })
        .start();

      // Sent first, so an event for it would fail the ordered expectation above.
      await runner.makeRequest('post', '/rpc/planet/missing', { ...JSON_REQUEST, expectError: true });
      await runner.makeRequest('post', '/rpc/planet/crash', { ...JSON_REQUEST, expectError: true });
      await runner.completed();
    });

    test('captures errors thrown while an event iterator is consumed', async () => {
      const runner = createRunner()
        .ignore('span')
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'Sentry Stream Error',
                  mechanism: { type: 'auto.rpc.orpc', handled: false },
                },
              ],
            },
            contexts: { orpc: { procedure_path: 'planet/stream' } },
          },
        })
        .start();

      await runner.makeRequest('post', '/rpc/planet/stream', JSON_REQUEST);
      await runner.completed();
    });

    // `@sentry/node` doesn't instrument Deno's `fetch` (see `NO_FETCH_INSTRUMENTATION` in the Deno excludes).
    test.runIf(supports({ runtimes: ['node', 'bun'] }))(
      'continues the trace of an oRPC client call on the server',
      async () => {
        const runner = createRunner();
        // The plain `http` server has no route, so the segment of the outer request is named after its method.
        const spansPromise = runner.collectStreamedSpans(
          spans =>
            spans.some(span => span.is_segment && span.name === 'GET') &&
            spans.some(span => span.is_segment && span.name === 'planet/find'),
        );

        const started = runner.start();
        await started.makeRequest('get', '/client-call');
        const spans = await spansPromise;

        const httpClientSpan = spans.find(span => span.attributes?.[SENTRY_OP]?.value === 'http.client');
        const serverSegment = spans.find(span => span.is_segment && span.name === 'planet/find');
        expect(httpClientSpan).toBeDefined();
        expect(serverSegment?.parent_span_id).toBe(httpClientSpan?.span_id);
      },
    );
  });
});
