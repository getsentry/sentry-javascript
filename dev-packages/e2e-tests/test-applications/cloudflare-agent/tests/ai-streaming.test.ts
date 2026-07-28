import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// Drives Workers AI through the real Cloudflare Agents SDK + Vercel AI SDK + `workers-ai-provider`
// stack (the OpenAI-compatible SSE shape, `choices[].delta.content`) from an Agent's `onRequest`.
// Asserts the streaming response text is captured on the gen_ai span — the regression seen in
// production where only input + usage survived. The model output is read from
// `gen_ai.output.messages`, so the streaming instrumentation must emit it alongside the
// deprecated `gen_ai.response.text`.
function assertGenAiStreamingSpan(spans: Array<Record<string, any>> | undefined): void {
  const genAiSpan = (spans ?? []).find(span => span.op === 'gen_ai.chat');

  expect(genAiSpan).toBeDefined();
  expect(genAiSpan.origin).toBe('auto.ai.cloudflare.workers_ai');
  expect(genAiSpan.data).toEqual(
    expect.objectContaining({
      'sentry.origin': 'auto.ai.cloudflare.workers_ai',
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': '@cf/meta/llama-3.1-8b-instruct',
      'gen_ai.response.streaming': true,
      'gen_ai.response.text': 'The capital of France is Paris.',
      'gen_ai.output.messages': JSON.stringify([
        { role: 'assistant', parts: [{ type: 'text', content: 'The capital of France is Paris.' }] },
      ]),
      'gen_ai.usage.input_tokens': 15,
      'gen_ai.usage.output_tokens': 8,
      'gen_ai.usage.total_tokens': 23,
    }),
  );
}

test('captures Workers AI streaming output when driven via an Agent', async ({ request, baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /agents/my-agent/test' &&
      (transactionEvent.spans ?? []).some(span => span.op === 'gen_ai.chat')
    );
  });

  const response = await request.get(`${baseURL}/agents/my-agent/test`);
  expect(response.ok()).toBe(true);

  const transaction = await transactionPromise;
  assertGenAiStreamingSpan(transaction.spans);
});

test('captures Workers AI streaming output when driven via an AIChatAgent', async ({ request, baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /agents/my-chat-agent/test' &&
      (transactionEvent.spans ?? []).some(span => span.op === 'gen_ai.chat')
    );
  });

  const response = await request.get(`${baseURL}/agents/my-chat-agent/test`);
  expect(response.ok()).toBe(true);

  const transaction = await transactionPromise;
  assertGenAiStreamingSpan(transaction.spans);
});
