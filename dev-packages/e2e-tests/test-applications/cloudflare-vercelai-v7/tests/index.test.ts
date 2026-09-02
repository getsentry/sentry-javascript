import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';

test('captures Vercel AI v7 spans with nodejs_compat using tracing channels', async ({ baseURL }) => {
  const genAiSpansPromise = waitForStreamedSpans('cloudflare-vercelai-v7-compat', spans =>
    spans.some(span => getSpanOp(span) === 'gen_ai.invoke_agent'),
  );

  const response = await fetch(`${baseURL}/generate`);

  expect(response.status).toBe(200);

  const genAiSpans = await genAiSpansPromise;

  const invokeAgentSpan = genAiSpans.find(span => getSpanOp(span) === 'gen_ai.invoke_agent');
  const generateContentSpan = genAiSpans.find(span => getSpanOp(span) === 'gen_ai.generate_content');

  expect(invokeAgentSpan).toEqual({
    trace_id: expect.stringMatching(/^[a-f0-9]{32}$/),
    parent_span_id: expect.stringMatching(/^[a-f0-9]{16}$/),
    span_id: expect.stringMatching(/^[a-f0-9]{16}$/),
    name: 'invoke_agent',
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    status: 'ok',
    is_segment: false,
    attributes: expect.objectContaining({
      'gen_ai.operation.name': { value: 'invoke_agent', type: 'string' },
      'gen_ai.usage.input_tokens': { value: 10, type: 'integer' },
      'gen_ai.usage.output_tokens': { value: 20, type: 'integer' },
      'gen_ai.usage.total_tokens': { value: 30, type: 'integer' },
      'sentry.op': { value: 'gen_ai.invoke_agent', type: 'string' },
      'sentry.origin': { value: 'auto.vercelai.channel', type: 'string' },
    }),
  });

  expect(generateContentSpan).toEqual({
    trace_id: invokeAgentSpan!.trace_id,
    parent_span_id: invokeAgentSpan!.span_id,
    span_id: expect.stringMatching(/^[a-f0-9]{16}$/),
    name: 'generate_content mock-model-id',
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    status: 'ok',
    is_segment: false,
    attributes: expect.objectContaining({
      'gen_ai.operation.name': { value: 'generate_content', type: 'string' },
      'gen_ai.usage.input_tokens': { value: 10, type: 'integer' },
      'gen_ai.usage.output_tokens': { value: 20, type: 'integer' },
      'gen_ai.usage.total_tokens': { value: 30, type: 'integer' },
      'sentry.op': { value: 'gen_ai.generate_content', type: 'string' },
      'sentry.origin': { value: 'auto.vercelai.channel', type: 'string' },
    }),
  });
});
