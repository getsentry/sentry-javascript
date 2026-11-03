import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createRunner } from '../../../runner';

interface Invocation {
  trigger: string;
  durationMs: number;
}

// Regression test for https://github.com/getsentry/sentry-javascript/issues/25489
// workerd keeps a Durable Object invocation open until its pending timers fire, so an SDK timer
// that is still pending when the method returns makes the invocation longer, and billed.
it('does not keep Durable Object invocations open after the method returns', async ({ signal }) => {
  // The tail worker must run in the same `wrangler dev` process to receive the tail events.
  const runner = createRunner(__dirname)
    .withWranglerArgs('--config', join(__dirname, 'wrangler-tail.jsonc'))
    .start(signal);

  await runner.makeRequest('get', '/fetch');
  await runner.makeRequest('get', '/rpc');
  await runner.makeRequest('get', '/alarm');

  const { fetchInvocation, rpcInvocation, alarmInvocation } = await vi.waitFor(
    async () => {
      const invocations = (await runner.makeRequest<Invocation[]>('get', '/invocations')) ?? [];
      const result = {
        fetchInvocation: invocations.find(invocation => invocation.trigger === 'fetch'),
        rpcInvocation: invocations.find(invocation => invocation.trigger === 'ping'),
        alarmInvocation: invocations.find(invocation => invocation.trigger === 'alarm'),
      };

      expect(result.fetchInvocation).toBeDefined();
      expect(result.rpcInvocation).toBeDefined();
      expect(result.alarmInvocation).toBeDefined();

      return result;
    },
    { timeout: 10_000, interval: 100 },
  );

  // An invocation takes a few ms locally. The limit leaves room for slow CI machines and still
  // fails for a 500 ms timer.
  expect(fetchInvocation?.durationMs).toBeLessThan(250);
  expect(rpcInvocation?.durationMs).toBeLessThan(250);
  expect(alarmInvocation?.durationMs).toBeLessThan(250);
});
