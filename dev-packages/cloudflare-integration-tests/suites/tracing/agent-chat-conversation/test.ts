import { expect, it } from 'vitest';
import { GEN_AI_CONVERSATION_ID_ATTRIBUTE } from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import type { TransactionEvent } from '@sentry/core';
import { createRunner } from '../../../runner';

// In the Agents model one agent instance is one conversation, so the instance name is the
// conversation id the SDK correlates the turn's gen_ai spans with.
const CONVERSATION_ID = 'chat-instance';

it('stamps the conversation id on gen_ai spans created inside a chat turn', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transaction = envelope[1]?.[0]?.[1] as TransactionEvent;

      const genAiSpan = (transaction.spans ?? []).find(span => span.op === 'gen_ai.chat');
      expect(genAiSpan).toBeDefined();
      expect(genAiSpan?.data).toEqual(
        expect.objectContaining({
          [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: CONVERSATION_ID,
        }),
      );
    })
    // The WebSocket upgrade produces its own `GET /agents/...` transaction ahead of the
    // `webSocketMessage` one that carries the gen_ai span; `.unordered()` lets us skip it.
    .unordered()
    .start(signal);

  await runner.agents.sendChatMessage({
    binding: 'my-chat-agent',
    instance: CONVERSATION_ID,
    prompt: 'What is the capital of France?',
  });
  await runner.completed();
});
