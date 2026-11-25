import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_TEXT,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const EXPECTED_ORIGIN = 'auto.ai.google_genai';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates google genai related spans with custom options', async () => {
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
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();

            const generateContentSpan = spans.find(span => span.name === 'generate_content gemini-1.5-flash');
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');

            const errorSpan = spans.find(span => span.name === 'generate_content error-model');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-recording-functions.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per call when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === EXPECTED_ORIGIN);
              const recordedByModel = Object.fromEntries(
                spans.map(span => [
                  span.attributes[GEN_AI_REQUEST_MODEL]?.value,
                  {
                    inputs: GEN_AI_INPUT_MESSAGES in span.attributes,
                    outputs: GEN_AI_RESPONSE_TEXT in span.attributes,
                  },
                ]),
              );
              expect(recordedByModel).toEqual({
                'gemini-public': { inputs: true, outputs: true },
                'gemini-private': { inputs: false, outputs: false },
                'gemini-public-stream': { inputs: true, outputs: false },
              });
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-recording-functions.mjs',
    'instrument-with-span-hooks.mjs',
    (createRunner, test) => {
      test('runs the span hooks at start in the caller context and at end with the response', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === EXPECTED_ORIGIN);
              const hooksByKey = Object.fromEntries(
                spans.map(span => [
                  span.attributes[GEN_AI_REQUEST_MODEL]?.value,
                  [span.attributes['test.start']?.value, span.attributes['test.end']?.value],
                ]),
              );
              expect(hooksByKey).toEqual({
                'gemini-public': ['gemini-public:public', 'Paris.'],
                'gemini-private': ['gemini-private:private', 'Paris.'],
                // A stream has no single response object, and its tag changes only after the call started.
                'gemini-public-stream': ['gemini-public-stream:private', 'no response'],
              });
            },
          })
          .start()
          .completed();
      });
    },
  );
});
