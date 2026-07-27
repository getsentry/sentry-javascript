import { expect, it } from 'vitest';
import type { TransactionEvent } from '@sentry/core';
import { createRunner } from '../../../runner';

const AGENT_INSTANCE = 'rpc-instance';

it('creates an rpc span for a @callable() invocation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transaction = envelope[1]?.[0]?.[1] as TransactionEvent;

      expect(transaction.transaction).toBe('webSocketMessage');

      const rpcSpan = (transaction.spans ?? []).find(span => span.op === 'rpc' && span.description === 'greet');
      expect(rpcSpan).toEqual(
        expect.objectContaining({
          op: 'rpc',
          description: 'greet',
          origin: 'auto.faas.cloudflare.agents',
          data: expect.objectContaining({
            'cloudflare.agent.class': expect.any(String),
            'cloudflare.agent.name': AGENT_INSTANCE,
          }),
        }),
      );
    })
    // The WebSocket upgrade produces its own `GET /agents/...` transaction ahead of the
    // `webSocketMessage` one that carries the RPC span; `.unordered()` lets us skip it.
    .unordered()
    .start(signal);

  await runner.agents.callRpc({ binding: 'my-agent', instance: AGENT_INSTANCE, method: 'greet', args: ['World'] });
  await runner.completed();
});

it('creates a function span for a scheduled task', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    // The schedule runs from the Agent's `alarm` handler, which Sentry instruments as the root
    // transaction; the schedule span nests under it.
    .expect(envelope => {
      const transaction = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transaction.transaction).toBe('alarm');

      const scheduleSpan = (transaction.spans ?? []).find(
        span => span.op === 'function' && span.description === 'scheduledTask',
      );
      expect(scheduleSpan).toEqual(
        expect.objectContaining({
          op: 'function',
          description: 'scheduledTask',
          origin: 'auto.faas.cloudflare.agents',
          data: expect.objectContaining({
            'cloudflare.agent.schedule.id': expect.any(String),
          }),
        }),
      );
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/agents/my-agent/sched-instance/schedule');
  await runner.completed();
});
