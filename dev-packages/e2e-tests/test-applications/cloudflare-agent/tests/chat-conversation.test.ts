import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForTransaction } from '@sentry-internal/test-utils';
import { sendChatMessage } from './agent-socket';

// In the Agents model one agent instance is one conversation, so the instance name is the
// conversation id the SDK correlates the turn's gen_ai spans with.
const CONVERSATION_ID = 'chat-conv-instance';

test('stamps the conversation id on gen_ai spans created inside a chat turn', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan('cloudflare-agent', span => getSpanOp(span) === 'gen_ai.chat');
  const transactionPromise = waitForTransaction(
    'cloudflare-agent',
    transactionEvent => transactionEvent.transaction === 'webSocketMessage',
  );

  await sendChatMessage(baseURL!, {
    binding: 'my-chat-agent',
    instance: CONVERSATION_ID,
    prompt: 'What is the capital of France?',
  });

  const [genAiSpan, transaction] = await Promise.all([spanPromise, transactionPromise]);
  expect(genAiSpan.trace_id).toBe(transaction.contexts?.trace?.trace_id);
  expect(genAiSpan.attributes['gen_ai.conversation.id']?.value).toBe(CONVERSATION_ID);
});
