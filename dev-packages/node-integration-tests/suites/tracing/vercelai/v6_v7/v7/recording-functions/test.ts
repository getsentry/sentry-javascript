import { afterAll, describe, expect } from 'vitest';
import { GEN_AI_INPUT_MESSAGES, GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmTests } from '../../../../../../utils/runner';
import { join } from 'node:path';

describe('Vercel AI integration (version 7)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-recording-functions.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per span when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const recorded = (operationId: string): { inputs: boolean; outputs: boolean }[] =>
                container.items
                  .filter(span => span.attributes['vercel.ai.operationId']?.value === operationId)
                  .map(span => ({
                    inputs: GEN_AI_INPUT_MESSAGES in span.attributes,
                    outputs: GEN_AI_OUTPUT_MESSAGES in span.attributes,
                  }));

              // `recordOutputs` skips `generateText` by type; the scope tag decides the rest.
              expect(recorded('ai.generateText')).toEqual([
                { inputs: true, outputs: false },
                { inputs: false, outputs: false },
              ]);
              expect(recorded('ai.generateText.doGenerate')).toEqual([
                { inputs: true, outputs: true },
                { inputs: false, outputs: false },
              ]);
              // The scenario makes the scope private while the stream is read, after both spans started.
              expect(recorded('ai.streamText')).toEqual([{ inputs: true, outputs: true }]);
              expect(recorded('ai.streamText.doStream')).toEqual([{ inputs: true, outputs: true }]);
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^7.0.0' } },
  );
});
