import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { join } from 'node:path';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('Anthropic integration', () => {
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
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.anthropic',
              );
              const recordedById = Object.fromEntries(
                spans.map(span => [
                  span.attributes[GEN_AI_RESPONSE_ID]?.value ?? span.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]?.value,
                  {
                    inputs: GEN_AI_INPUT_MESSAGES in span.attributes || GEN_AI_TOOL_CALL_ARGUMENTS in span.attributes,
                    outputs: GEN_AI_RESPONSE_TEXT in span.attributes || GEN_AI_TOOL_CALL_RESULT in span.attributes,
                  },
                ]),
              );
              expect(recordedById).toEqual({
                msg_public: { inputs: true, outputs: true },
                msg_private: { inputs: false, outputs: false },
                'msg_public-stream': { inputs: true, outputs: false },
                'msg_public-helper-stream': { inputs: true, outputs: false },
                msg_tool_use: { inputs: false, outputs: true },
                msg_tool_final: { inputs: false, outputs: true },
                toolu_vienna: { inputs: true, outputs: true },
                toolu_paris: { inputs: false, outputs: true },
              });
            },
          })
          .start()
          .completed();
      });
    },
  );
});
