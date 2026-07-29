import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { sendChatMessage } from './agent-socket';

// In the Agents model one agent instance is one conversation, so the instance name is the
// conversation id the SDK correlates the turn's gen_ai spans with.
const CONVERSATION_ID = 'chat-conv-instance';

test('stamps the conversation id on gen_ai spans created inside a chat turn', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'webSocketMessage' &&
      (transactionEvent.spans ?? []).some(span => span.op === 'gen_ai.chat')
    );
  });

  await sendChatMessage(baseURL!, {
    binding: 'my-chat-agent',
    instance: CONVERSATION_ID,
    prompt: 'What is the capital of France?',
  });

  const transaction = await transactionPromise;

  const genAiSpan = (transaction.spans ?? []).find(span => span.op === 'gen_ai.chat');
  expect(genAiSpan).toBeDefined();
  expect(genAiSpan?.data).toEqual(
    expect.objectContaining({
      'gen_ai.conversation.id': CONVERSATION_ID,
    }),
  );
});
