import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_TEXT,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../../utils/runner';
import { join } from 'node:path';

describe('OpenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-recording-functions.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per call when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.openai');
              const recordedById = Object.fromEntries(
                spans.map(span => [
                  span.attributes[GEN_AI_RESPONSE_ID]?.value,
                  {
                    inputs: GEN_AI_INPUT_MESSAGES in span.attributes,
                    outputs: GEN_AI_RESPONSE_TEXT in span.attributes,
                  },
                ]),
              );
              expect(recordedById).toEqual({
                'chatcmpl-public': { inputs: true, outputs: true },
                'chatcmpl-private': { inputs: false, outputs: false },
                'chatcmpl-public-stream': { inputs: true, outputs: false },
              });
            },
          })
          .start()
          .completed();
      });
    },
  );
});
