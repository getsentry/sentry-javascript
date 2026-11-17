import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createRunner } from '../../../runner';

interface Invocation {
  trigger: string;
  durationMs: number;
}

const INVOCATIONS_PER_TRIGGER = 5;

// Regression test for https://github.com/getsentry/sentry-javascript/issues/25489
// workerd keeps a Durable Object invocation open until its pending timers fire, so an SDK timer
// that is still pending when the method returns makes the invocation longer, and billed.
it('does not keep Durable Object invocations open after the method returns', async ({ signal }) => {
  // The tail worker must run in the same `wrangler dev` process to receive the tail events.
  const runner = createRunner(__dirname)
    .withWranglerArgs('--config', join(__dirname, 'wrangler-tail.jsonc'))
    .start(signal);

  // A pending SDK timer delays every invocation. A busy CI machine delays only some of them, by as
  // much as the timer does. Only the fastest of several invocations tells the two apart.
  async function measureFastestInvocation(path: string, trigger: string): Promise<number> {
    // Each request invokes a new instance, because the first invocation of an instance also sets up the SDK.
    for (let instance = 0; instance < INVOCATIONS_PER_TRIGGER; instance++) {
      await runner.makeRequest('get', `${path}?instance=${instance}`);
    }

    const durations = await vi.waitFor(
      async () => {
        const invocations = (await runner.makeRequest<Invocation[]>('get', '/invocations')) ?? [];
        const durationsOfTrigger = invocations
          .filter(invocation => invocation.trigger === trigger)
          .map(invocation => invocation.durationMs);

        expect(durationsOfTrigger).toHaveLength(INVOCATIONS_PER_TRIGGER);

        return durationsOfTrigger;
      },
      { timeout: 10_000, interval: 100 },
    );

    return Math.min(...durations);
  }

  const fetchDuration = await measureFastestInvocation('/fetch', 'fetch');
  const rpcDuration = await measureFastestInvocation('/rpc', 'ping');
  const alarmDuration = await measureFastestInvocation('/alarm', 'alarm');

  // An invocation takes a few ms locally, and 500 ms with the timer of the regression.
  expect(fetchDuration).toBeLessThan(250);
  expect(rpcDuration).toBeLessThan(250);
  expect(alarmDuration).toBeLessThan(250);
});
