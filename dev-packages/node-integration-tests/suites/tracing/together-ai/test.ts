import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const PROVIDER = 'together_ai';
const ORIGIN = 'auto.ai.together_ai';

describe('Together integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates chat and embeddings spans with genAI recording disabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const chatSpan = container.items.find(s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123');
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.name).toBe('chat meta-llama/Llama-3.3-70B-Instruct-Turbo');
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('chat');
            expect(chatSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value).toBe('gen_ai.chat');
            expect(chatSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(chatSpan!.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe(PROVIDER);
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
            expect(chatSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE]?.value).toBe(0.7);
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_MODEL]?.value).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["stop"]');
            expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
            expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(15);
            expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(25);
            // recording disabled → no prompt/response content
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeUndefined();

            const streamSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-123',
            );
            expect(streamSpan).toBeDefined();
            expect(streamSpan!.name).toBe('chat meta-llama/Llama-3.1-8B-Instruct-Turbo');
            expect(streamSpan!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('chat');
            expect(streamSpan!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
            expect(streamSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(30);

            const errorSpan = container.items.find(s => s.attributes[GEN_AI_REQUEST_MODEL]?.value === 'error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');

            const embeddingsSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'embd-mock123',
            );
            expect(embeddingsSpan).toBeDefined();
            expect(embeddingsSpan!.name).toBe('embeddings togethercomputer/m2-bert-80M-8k-retrieval');
            expect(embeddingsSpan!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('embeddings');
            expect(embeddingsSpan!.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value).toBe('gen_ai.embeddings');
            expect(embeddingsSpan!.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe(PROVIDER);
            expect(embeddingsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(8);
            expect(embeddingsSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT]).toBeUndefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records chat and embeddings inputs/outputs with PII enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const chatSpan = container.items.find(s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123');
            expect(chatSpan).toBeDefined();
            // The system message is split out into gen_ai.system_instructions.
            expect(chatSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]?.value).toContain('You are a helpful assistant.');
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES]?.value).toBe(
              '[{"role":"user","content":"What is the capital of France?"}]',
            );
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('["Hello from Together mock!"]');

            const embeddingsSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'embd-mock123',
            );
            expect(embeddingsSpan).toBeDefined();
            expect(embeddingsSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value).toContain('Embedding test!');
          },
        })
        .start()
        .completed();
    });
  });
});
