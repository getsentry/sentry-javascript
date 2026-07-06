import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
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
              'sentry.origin': { type: 'string', value: 'auto.vercelai.otel' },
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: { type: 'string', value: 'invoke_agent' },
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: { type: 'integer', value: 10 },
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: { type: 'integer', value: 20 },
              [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: { type: 'integer', value: 30 },
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
              'sentry.origin': { type: 'string', value: 'auto.vercelai.otel' },
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: { type: 'string', value: 'generate_content' },
            }),
          },
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
