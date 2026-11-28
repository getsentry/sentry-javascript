import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { RPC } from '@sentry/conventions/op';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

const ORIGIN = { type: 'string', value: 'auto.rpc.orpc' };

const JSON_REQUEST = {
  headers: { 'content-type': 'application/json' },
  data: JSON.stringify({ json: { name: 'Earth' } }),
};

it('records one span for a procedure call and names the transaction after the procedure', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('event').start(signal);

  const spansPromise = runner.collectStreamedSpans(spansOfTrace =>
    spansOfTrace.some(span => span.name === 'planet/find' && !span.is_segment),
  );

  await runner.makeRequest('post', '/rpc/planet/find', JSON_REQUEST);

  const spans = await spansPromise;
  expect(spans.find(span => span.is_segment)?.name).toBe('planet/find');
  expect(spans.filter(span => span.attributes?.[SENTRY_ORIGIN]?.value === ORIGIN.value)).toEqual([
    expect.objectContaining({
      name: 'planet/find',
      is_segment: false,
      attributes: expect.objectContaining({
        [SENTRY_OP]: { type: 'string', value: RPC },
        [SENTRY_ORIGIN]: ORIGIN,
        'rpc.method': { type: 'string', value: 'planet/find' },
      }),
    }),
  ]);
});

it('captures errors thrown by procedures, but not 4xx ORPCErrors', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('span')
    .expect(envelope => {
      const event = envelope[1][0]?.[1] as {
        transaction?: string;
        exception?: { values?: Array<{ value?: string; mechanism?: unknown }> };
        contexts?: Record<string, unknown>;
      };
      expect(event.transaction).toBe('planet/crash');
      expect(event.exception?.values?.[0]).toMatchObject({
        type: 'Error',
        value: 'Sentry Test Error',
        mechanism: { type: 'auto.rpc.orpc', handled: false },
      });
      expect(event.contexts?.orpc).toMatchObject({ procedure_path: 'planet/crash' });
    })
    .start(signal);

  // Sent first, so an event for it would fail the expectation above.
  await runner.makeRequest('post', '/rpc/planet/missing', { ...JSON_REQUEST, expectError: true });
  await runner.makeRequest('post', '/rpc/planet/crash', { ...JSON_REQUEST, expectError: true });
  await runner.completed();
});
