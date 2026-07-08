import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('captures Vercel AI v7 spans with nodejs_compat using tracing channels', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-vercelai-v7-compat', txn => {
    return txn.transaction === 'GET /generate';
  });

  const response = await fetch(`${baseURL}/generate`);

  expect(response.status).toBe(200);

  const transaction = await transactionPromise;

  expect(transaction.transaction).toBe('GET /generate');
  expect(transaction.contexts?.trace?.op).toBe('http.server');
  expect(transaction.spans).toHaveLength(2);

  expect(transaction.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'invoke_agent',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.channel',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        data: expect.objectContaining({
          'gen_ai.operation.name': 'invoke_agent',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.channel',
        }),
      }),
      expect.objectContaining({
        description: 'generate_content mock-model-id',
        op: 'gen_ai.generate_content',
        origin: 'auto.vercelai.channel',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        data: expect.objectContaining({
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'sentry.op': 'gen_ai.generate_content',
          'sentry.origin': 'auto.vercelai.channel',
        }),
      }),
    ]),
  );
});
