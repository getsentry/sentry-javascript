import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { callRpc, sendChatMessage } from './agent-socket';

const AGENT_INSTANCE = 'chat-conv-instance';

// In the Agents model one agent instance is one conversation. The SDK mints the conversation id
// itself and persists it in the instance's Durable Object storage rather than deriving it from the
// caller-chosen instance name, so the assertion is on the shape of the id — `uuid4()` from
// `@sentry/core`, i.e. 32 hex characters without dashes.
const UUID_PATTERN = /^[0-9a-f]{32}$/;

function getGenAiSpan(spans: Array<Record<string, any>> | undefined): Record<string, any> {
  const genAiSpan = (spans ?? []).find(span => span.op === 'gen_ai.chat');
  expect(genAiSpan).toBeDefined();

  return genAiSpan as Record<string, any>;
}

test('stamps the conversation id on gen_ai spans created inside a chat turn', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'webSocketMessage' &&
      (transactionEvent.spans ?? []).some(span => span.op === 'gen_ai.chat')
    );
  });

  await sendChatMessage(baseURL!, {
    binding: 'my-chat-agent',
    instance: AGENT_INSTANCE,
    prompt: 'What is the capital of France?',
  });

  const transaction = await transactionPromise;

  expect(getGenAiSpan(transaction.spans).data['gen_ai.conversation.id']).toMatch(UUID_PATTERN);
});

// The agent calls `Sentry.setConversationId('conv_manual_e2e')` at the start of `onChatMessage`, the
// recipe the docs recommend for keying a conversation on the app's own id. The manual id must win
// over the SDK-minted uuid that the instrumentation put on the scope before the handler ran.
test('a conversation id set manually inside onChatMessage wins over the SDK-minted one', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'webSocketMessage' &&
      (transactionEvent.spans ?? []).some(span => span.op === 'gen_ai.chat')
    );
  });

  await sendChatMessage(baseURL!, {
    binding: 'my-manual-chat-agent',
    instance: 'chat-manual-instance',
    prompt: 'What is the capital of France?',
  });

  const transaction = await transactionPromise;

  expect(getGenAiSpan(transaction.spans).data['gen_ai.conversation.id']).toBe('conv_manual_e2e');
});

// Same recipe on the other two entry points the SDK wraps: the manual id must win regardless of
// which handler the agent uses for its AI work.
test('a conversation id set manually inside onRequest wins over the SDK-minted one', async ({ request, baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /agents/my-manual-chat-agent/chat-manual-request-instance' &&
      (transactionEvent.spans ?? []).some(span => span.op === 'gen_ai.chat')
    );
  });

  const response = await request.get(`${baseURL}/agents/my-manual-chat-agent/chat-manual-request-instance`);
  expect(response.ok()).toBe(true);

  const transaction = await transactionPromise;

  expect(getGenAiSpan(transaction.spans).data['gen_ai.conversation.id']).toBe('conv_manual_e2e');
});

test('a conversation id set manually inside a callable RPC method wins over the SDK-minted one', async ({
  baseURL,
}) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (transactionEvent.spans ?? []).some(span => span.op === 'gen_ai.chat');
  });

  await callRpc(baseURL!, {
    binding: 'my-manual-chat-agent',
    instance: 'chat-manual-rpc-instance',
    method: 'runAiTurn',
    args: [],
  });

  const transaction = await transactionPromise;

  expect(getGenAiSpan(transaction.spans).data['gen_ai.conversation.id']).toBe('conv_manual_e2e');
});
