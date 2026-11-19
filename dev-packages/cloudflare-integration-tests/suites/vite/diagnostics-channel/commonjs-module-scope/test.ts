import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

// workerd does not allow a channel publish at module scope, so the SDK keeps the event of `emit.cjs` and publishes
// it with the first request.
it('publishes a channel event that a CommonJS module emits at module scope', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  const body = await runner.makeRequest('get', '/');

  expect(body).toEqual({ received: [{ arguments: ['from a CommonJS module'] }] });
});
