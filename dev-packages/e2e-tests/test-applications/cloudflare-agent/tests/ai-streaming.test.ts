import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForTransaction } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry/core';

// Drives Workers AI through the real Cloudflare Agents SDK + Vercel AI SDK + `workers-ai-provider`
// stack (the OpenAI-compatible SSE shape, `choices[].delta.content`) from an Agent's `onRequest`.
// Asserts the streaming response text is captured on the gen_ai span — the regression seen in
// production where only input + usage survived. The model output is read from
// `gen_ai.output.messages`, so the streaming instrumentation must emit it alongside the
// deprecated `gen_ai.response.text`.
function assertGenAiStreamingSpan(span: SerializedStreamedSpan): void {
  expect(getSpanOp(span)).toBe('gen_ai.chat');
  expect(span.attributes['sentry.origin']?.value).toBe('auto.ai.cloudflare.workers_ai');
  expect(span.attributes['gen_ai.operation.name']?.value).toBe('chat');
  expect(span.attributes['gen_ai.request.model']?.value).toBe('@cf/meta/llama-3.1-8b-instruct');
  expect(span.attributes['gen_ai.response.streaming']?.value).toBe(true);
  expect(span.attributes['gen_ai.response.text']?.value).toBe('The capital of France is Paris.');
  expect(span.attributes['gen_ai.output.messages']?.value).toBe(
    JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'The capital of France is Paris.' }] }]),
  );
  expect(span.attributes['gen_ai.usage.input_tokens']?.value).toBe(15);
  expect(span.attributes['gen_ai.usage.output_tokens']?.value).toBe(8);
  expect(span.attributes['gen_ai.usage.total_tokens']?.value).toBe(23);
}

test('captures Workers AI streaming output when driven via an Agent', async ({ request, baseURL }) => {
  const spanPromise = waitForStreamedSpan('cloudflare-agent', span => getSpanOp(span) === 'gen_ai.chat');
  const transactionPromise = waitForTransaction(
    'cloudflare-agent',
    transactionEvent => transactionEvent.transaction === 'GET /agents/my-agent/test',
  );

  const response = await request.get(`${baseURL}/agents/my-agent/test`);
  expect(response.ok()).toBe(true);

  const [span, transaction] = await Promise.all([spanPromise, transactionPromise]);
  expect(span.trace_id).toBe(transaction.contexts?.trace?.trace_id);
  assertGenAiStreamingSpan(span);
});

test('captures Workers AI streaming output when driven via an AIChatAgent', async ({ request, baseURL }) => {
  const spanPromise = waitForStreamedSpan('cloudflare-agent', span => getSpanOp(span) === 'gen_ai.chat');
  const transactionPromise = waitForTransaction(
    'cloudflare-agent',
    transactionEvent => transactionEvent.transaction === 'GET /agents/my-chat-agent/test',
  );

  const response = await request.get(`${baseURL}/agents/my-chat-agent/test`);
  expect(response.ok()).toBe(true);

  const [span, transaction] = await Promise.all([spanPromise, transactionPromise]);
  expect(span.trace_id).toBe(transaction.contexts?.trace?.trace_id);
  assertGenAiStreamingSpan(span);
});
