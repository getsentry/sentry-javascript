import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_TEXT,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { join } from 'node:path';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-recording-functions.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per call when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.google_genai',
              );
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
});
