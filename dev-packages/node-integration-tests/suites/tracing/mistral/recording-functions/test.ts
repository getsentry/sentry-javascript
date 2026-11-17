import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_TEXT,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { join } from 'node:path';
import { cleanupChildProcesses, createEsmTests } from '../../../../utils/runner';

// ESM-only, like the rest of the Mistral suite: `@mistralai/mistralai` v2+ ships no CJS build.
describe('Mistral integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(
    join(__dirname, '..'),
    'scenario-recording-functions.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per call when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mistralai',
              );
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
                'cmpl-mistral-public': { inputs: true, outputs: true },
                'cmpl-mistral-private': { inputs: false, outputs: false },
                'cmpl-mistral-public-stream': { inputs: true, outputs: false },
              });
            },
          })
          .start()
          .completed();
      });
    },
  );
});
