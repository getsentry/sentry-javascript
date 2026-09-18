import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { createRunner } from '../../../../runner';

it('captures a transaction with Vercel AI v6 spans via @sentry/cloudflare vercelAIIntegration', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /');

      const container = envelope[1]?.[1]?.[1] as any;
      expect(container).toBeDefined();

      expect(container.items).toHaveLength(2);
      expect(container.items).toEqual(
        expect.arrayContaining([
          {
            trace_id: expect.any(String),
            span_id: expect.any(String),
            parent_span_id: expect.any(String),
            name: 'invoke_agent',
            start_timestamp: expect.any(Number),
            end_timestamp: expect.any(Number),
            status: 'ok',
            is_segment: false,
            attributes: expect.objectContaining({
              'sentry.op': { type: 'string', value: 'gen_ai.invoke_agent' },
              'sentry.origin': { type: 'string', value: 'auto.vercelai.channel' },
              [GEN_AI_OPERATION_NAME]: { type: 'string', value: 'invoke_agent' },
              [GEN_AI_USAGE_INPUT_TOKENS]: { type: 'integer', value: 10 },
              [GEN_AI_USAGE_OUTPUT_TOKENS]: { type: 'integer', value: 20 },
              [GEN_AI_USAGE_TOTAL_TOKENS]: { type: 'integer', value: 30 },
            }),
          },
          {
            trace_id: expect.any(String),
            span_id: expect.any(String),
            parent_span_id: expect.any(String),
            name: 'generate_content mock-model-id',
            start_timestamp: expect.any(Number),
            end_timestamp: expect.any(Number),
            status: 'ok',
            is_segment: false,
            attributes: expect.objectContaining({
              'sentry.op': { type: 'string', value: 'gen_ai.generate_content' },
              'sentry.origin': { type: 'string', value: 'auto.vercelai.channel' },
              [GEN_AI_OPERATION_NAME]: { type: 'string', value: 'generate_content' },
            }),
          },
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
