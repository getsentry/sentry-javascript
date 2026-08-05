import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// https://github.com/getsentry/sentry-javascript/issues/22729
// Storage spans should show who triggered them: calls made directly in an RPC method are
// attributed to that method via `code.function.name` (stamped on the RPC span itself), calls
// nested in a user-created span are not attributed to the user span's name.
it('attributes Durable Object storage spans to the calling RPC method', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  await runner.makeRequestAndWaitForEnvelope('get', '/', envelope => {
    const transactionEvent = (envelope as any)[1]?.[0]?.[1] as TransactionEvent | undefined;

    expect(transactionEvent).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: 'storeAndLoad',
      }),
    );

    const storageSpans = (transactionEvent?.spans ?? []).filter(
      span => span.origin === 'auto.db.cloudflare.durable_object',
    );

    expect(storageSpans).toHaveLength(3);

    const putSpan = storageSpans.find(span => span.data?.['db.query.text'] === 'put rpc-key');
    expect(putSpan).toEqual(
      expect.objectContaining({
        description: 'durable_object_storage_put',
        op: 'db',
        data: expect.objectContaining({
          'code.function.name': 'storeAndLoad',
          'db.operation.name': 'put',
        }),
      }),
    );

    const getSpan = storageSpans.find(span => span.data?.['db.query.text'] === 'get rpc-key');
    expect(getSpan).toEqual(
      expect.objectContaining({
        description: 'durable_object_storage_get',
        op: 'db',
        data: expect.objectContaining({
          'code.function.name': 'storeAndLoad',
          'db.operation.name': 'get',
        }),
      }),
    );

    // Nested in the user-created `custom-step` span: keys are still recorded, but the user span's
    // name must not leak into `code.function.name`.
    const nestedSpan = storageSpans.find(span => span.data?.['db.query.text'] === 'get nested-key');
    expect(nestedSpan).toEqual(
      expect.objectContaining({
        description: 'durable_object_storage_get',
        op: 'db',
      }),
    );
    expect(nestedSpan?.data).not.toHaveProperty('code.function.name');
  });
});
