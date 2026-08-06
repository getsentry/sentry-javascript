import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { callRpc } from './agent-socket';

const AGENT_INSTANCE = 'chat-rpc-instance';

test('creates an rpc span for a @callable() invocation on an AIChatAgent', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'webSocketMessage' &&
      (transactionEvent.spans ?? []).some(span => span.op === 'rpc' && span.description === 'greet')
    );
  });

  await callRpc(baseURL!, { binding: 'my-chat-agent', instance: AGENT_INSTANCE, method: 'greet', args: ['World'] });

  const transaction = await transactionPromise;

  const rpcSpan = (transaction.spans ?? []).find(span => span.op === 'rpc' && span.description === 'greet');
  expect(rpcSpan).toEqual(
    expect.objectContaining({
      op: 'rpc',
      description: 'greet',
      origin: 'auto.faas.cloudflare.agents',
    }),
  );
});
