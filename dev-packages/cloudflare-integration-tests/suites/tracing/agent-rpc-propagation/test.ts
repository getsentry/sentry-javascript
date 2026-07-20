import { expect, it } from 'vitest';
import type { TransactionEvent } from '@sentry/core';
import { createRunner } from '../../../runner';

const AGENT_INSTANCE = 'rpc-instance';

it('creates an rpc span for a @callable() invocation when RPC trace propagation is enabled', async ({ signal }) => {
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
    .unordered()
    .start(signal);

  await runner.agents.callRpc({ binding: 'my-agent', instance: AGENT_INSTANCE, method: 'greet', args: ['World'] });
  await runner.completed();
});
