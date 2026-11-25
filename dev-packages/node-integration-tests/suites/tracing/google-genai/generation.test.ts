import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const EXPECTED_ORIGIN = 'auto.ai.google_genai';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai related spans with genAI recording disabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.google_genai',
            );
            expect(spans).toHaveLength(3);
            expect(spans.map(span => span.name).sort()).toEqual([
              'chat gemini-1.5-pro',
              'generate_content error-model',
              'generate_content gemini-1.5-flash',
            ]);

            const chatSpan = spans.find(span => span.name === 'chat gemini-1.5-pro');
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
            expect(chatSpan!.attributes[SENTRY_ORIGIN].value).toBe(EXPECTED_ORIGIN);
            expect(chatSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gemini-1.5-pro');
            // Given once to `chats.create()` and reused for every message the chat sends.
            expect(chatSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.8);
            expect(chatSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(150);
            expect(chatSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
            expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
            expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
            expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);

            const generateContentSpan = spans.find(span => span.name === 'generate_content gemini-1.5-flash');
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gemini-1.5-flash');
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);

            const errorSpan = spans.find(span => span.name === 'generate_content error-model');
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
            expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai related spans with genAI recording enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.google_genai',
            );
            expect(spans).toHaveLength(3);
            expect(spans.map(span => span.name).sort()).toEqual([
              'chat gemini-1.5-pro',
              'generate_content error-model',
              'generate_content gemini-1.5-flash',
            ]);

            const chatSpan = spans.find(span => span.name === 'chat gemini-1.5-pro');
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
            expect(chatSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gemini-1.5-pro');
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();
            // Given once to `chats.create()` and reused for every message the chat sends.
            expect(chatSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.8);
            expect(chatSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(150);
            expect(chatSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(
              '[{"type":"text","content":"You are a friendly robot who likes to be funny."}]',
            );
            expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
            expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
            expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);

            const generateContentSpan = spans.find(span => span.name === 'generate_content gemini-1.5-flash');
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
            expect(generateContentSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gemini-1.5-flash');
            expect(generateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(generateContentSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);

            const errorSpan = spans.find(span => span.name === 'generate_content error-model');
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
            expect(errorSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-system-instructions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('extracts system instructions and normalizes messages', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.google_genai',
              );
              expect(spans).toHaveLength(2);
              const [firstSpan, secondSpan] = spans;

              // [0] generate_content with a string system instruction
              expect(firstSpan!.name).toBe('generate_content gemini-1.5-flash');
              expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(
                JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              );
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
                JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: 'Hello' }] }]),
              );

              // [1] generate_content with a `Content` system instruction and a tool-call turn
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(
                JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              );
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
                JSON.stringify([
                  { role: 'user', parts: [{ type: 'text', content: 'What time is it in Tokyo?' }] },
                  {
                    role: 'assistant',
                    parts: [{ type: 'tool_call', name: 'get_time', arguments: '{"timezone":"Asia/Tokyo"}' }],
                  },
                  {
                    role: 'user',
                    parts: [{ type: 'tool_call_response', name: 'get_time', result: '{"output":"10:00"}' }],
                  },
                ]),
              );
            },
          })
          .start()
          .completed();
      });
    },
  );
});
