import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('OpenAI integration > static lifecycle', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });
  createEsmAndCjsTests(__dirname, '../scenario-root-span.mjs', 'instrument.mjs', (createRunner, test) => {
    test('it works without a wrapping span', async () => {
      await createRunner()
        // First the span that our mock express server is emitting, unrelated to this test
        .expect({
          transaction: {
            transaction: 'POST /openai/chat/completions',
          },
        })
        .expect({
          transaction: {
            transaction: 'chat gpt-3.5-turbo',
            contexts: {
              trace: {
                span_id: expect.any(String),
                trace_id: expect.any(String),
                data: {
                  [GEN_AI_OPERATION_NAME]: 'chat',
                  [SENTRY_OP]: 'gen_ai.chat',
                  [SENTRY_ORIGIN]: 'auto.ai.openai',
                  [GEN_AI_PROVIDER_NAME]: 'openai',
                  [GEN_AI_REQUEST_MODEL]: 'gpt-3.5-turbo',
                  [GEN_AI_REQUEST_TEMPERATURE]: 0.7,
                  [GEN_AI_RESPONSE_MODEL]: 'gpt-3.5-turbo',
                  [GEN_AI_RESPONSE_ID]: 'chatcmpl-mock123',
                  [GEN_AI_RESPONSE_FINISH_REASONS]: '["stop"]',
                  [GEN_AI_USAGE_INPUT_TOKENS]: 10,
                  [GEN_AI_USAGE_OUTPUT_TOKENS]: 15,
                  [GEN_AI_USAGE_TOTAL_TOKENS]: 25,
                },
                op: 'gen_ai.chat',
                origin: 'auto.ai.openai',
                status: 'ok',
              },
            },
          },
        })
        .start()
        .completed();
    });
  });
});
