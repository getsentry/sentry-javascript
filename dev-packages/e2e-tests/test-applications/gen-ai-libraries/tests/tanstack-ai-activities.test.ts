import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { APP } from './constants';
import { attr, describeTree } from './utils';

// The span of an activity is active while the activity runs, so the provider request nests under it.
// Each test waits for the segment span, which ends last, so that all spans of the trace are there.

test('tanstack-ai: an embed() call emits a gen_ai.embeddings span, and no span of the OpenAI integration', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.embeddings') && spansOfTrace.some(span => span.is_segment),
  );

  const response = await fetch(`${baseURL}/tanstack-ai/embed`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const tree = describeTree(spans);
  const workflow = spans.find(span => span.name === 'ai-workflow');
  const embeddings = spans.filter(span => getSpanOp(span) === 'gen_ai.embeddings');
  const providerRequests = spans.filter(
    span => getSpanOp(span) === 'http.client' && span.parent_span_id === embeddings[0]?.span_id,
  );

  expect(embeddings, tree).toHaveLength(1);
  expect(embeddings[0]!.parent_span_id, tree).toBe(workflow?.span_id);
  expect(embeddings[0]!.name).toBe('embeddings openai/text-embedding-3-small');
  expect(embeddings[0]!.status).toBe('ok');
  expect(attr(embeddings[0]!, 'sentry.origin')).toBe('auto.ai.tanstack_ai');
  expect(attr(embeddings[0]!, 'gen_ai.operation.name')).toBe('embeddings');
  expect(attr(embeddings[0]!, 'gen_ai.provider.name')).toBe('openai');
  expect(attr(embeddings[0]!, 'gen_ai.request.model')).toBe('openai/text-embedding-3-small');
  expect(typeof attr(embeddings[0]!, 'gen_ai.response.model')).toBe('string');
  expect(attr(embeddings[0]!, 'gen_ai.usage.input_tokens')).toBeGreaterThan(0);
  expect(attr(embeddings[0]!, 'gen_ai.embeddings.input')).toBe('["a red guitar","a blue drum kit"]');

  expect(providerRequests, tree).toHaveLength(1);
  expect(String(attr(providerRequests[0]!, 'server.address') ?? providerRequests[0]!.name)).toContain('openrouter');
});

test('tanstack-ai: a decide() call emits a gen_ai.decide span', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.decide') && spansOfTrace.some(span => span.is_segment),
  );

  const response = await fetch(`${baseURL}/tanstack-ai/decide`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const tree = describeTree(spans);
  const workflow = spans.find(span => span.name === 'ai-workflow');
  const decideSpan = spans.find(span => getSpanOp(span) === 'gen_ai.decide');
  const providerRequests = spans.filter(
    span => getSpanOp(span) === 'http.client' && span.parent_span_id === decideSpan?.span_id,
  );

  expect(decideSpan, tree).toBeDefined();
  expect(decideSpan!.parent_span_id, tree).toBe(workflow?.span_id);
  expect(decideSpan!.name).toBe('decide ~typesafe/jev-latest');
  expect(decideSpan!.status).toBe('ok');
  expect(attr(decideSpan!, 'sentry.origin')).toBe('auto.ai.tanstack_ai');
  expect(attr(decideSpan!, 'gen_ai.operation.name')).toBe('decide');
  expect(attr(decideSpan!, 'gen_ai.provider.name')).toBe('openrouter');
  expect(attr(decideSpan!, 'gen_ai.request.model')).toBe('~typesafe/jev-latest');
  expect(typeof attr(decideSpan!, 'gen_ai.response.model')).toBe('string');
  expect(typeof attr(decideSpan!, 'gen_ai.response.id')).toBe('string');
  expect(attr(decideSpan!, 'gen_ai.usage.input_tokens')).toBeGreaterThan(0);
  expect(attr(decideSpan!, 'gen_ai.usage.output_tokens')).toBeGreaterThan(0);
  expect(attr(decideSpan!, 'gen_ai.cost.total_tokens')).toBeGreaterThan(0);
  expect(attr(decideSpan!, 'gen_ai.input.messages')).toContain('I was charged twice for my subscription.');
  expect(attr(decideSpan!, 'gen_ai.output.messages')).toContain('"queue":{"type":"choice"');
  expect(attr(decideSpan!, 'gen_ai.output.messages')).toContain('"refund":{"type":"boolean"');

  expect(providerRequests, tree).toHaveLength(1);
  expect(String(attr(providerRequests[0]!, 'server.address') ?? providerRequests[0]!.name)).toContain('openrouter');
});

// The rerank models of OpenRouter come from Cohere, and the zero data retention guardrail of the account
// of the test key blocks them, so OpenRouter refuses the request. Thus the test checks only what the span
// records when OpenRouter answers and when it refuses.
test('tanstack-ai: a rerank() call emits a gen_ai.rerank span', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.rerank') && spansOfTrace.some(span => span.is_segment),
  );

  await fetch(`${baseURL}/tanstack-ai/rerank`);

  const spans = await spansPromise;
  const tree = describeTree(spans);
  const workflow = spans.find(span => span.name === 'ai-workflow');
  const rerankSpan = spans.find(span => getSpanOp(span) === 'gen_ai.rerank');
  const providerRequests = spans.filter(
    span => getSpanOp(span) === 'http.client' && span.parent_span_id === rerankSpan?.span_id,
  );

  expect(rerankSpan, tree).toBeDefined();
  expect(rerankSpan!.parent_span_id, tree).toBe(workflow?.span_id);
  expect(rerankSpan!.name).toBe('rerank cohere/rerank-v3.5');
  expect(attr(rerankSpan!, 'sentry.origin')).toBe('auto.ai.tanstack_ai');
  expect(attr(rerankSpan!, 'gen_ai.operation.name')).toBe('rerank');
  expect(attr(rerankSpan!, 'gen_ai.provider.name')).toBe('openrouter');
  expect(attr(rerankSpan!, 'gen_ai.request.model')).toBe('cohere/rerank-v3.5');

  expect(providerRequests, tree).toHaveLength(1);
  expect(String(attr(providerRequests[0]!, 'server.address') ?? providerRequests[0]!.name)).toContain('openrouter');
});
