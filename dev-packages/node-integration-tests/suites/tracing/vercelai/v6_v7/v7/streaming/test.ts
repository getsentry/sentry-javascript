import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXECUTE_TOOL, GEN_AI_GENERATE_CONTENT } from '@sentry/conventions/op';
import { cleanupChildProcesses, createEsmTests } from '../../../../../../utils/runner';
import { registerVercelAiStreamingTests } from '../../suite';
import { join } from 'node:path';

describe('Vercel AI integration (version 7)', () => {
  registerVercelAiStreamingTests('7', '^7.0.0');
});

// Regression test for https://github.com/getsentry/sentry-javascript/issues/26403: on `ai` 7.0.168-7.0.173,
// streamText with tools failed with "ReadableStream is locked" once Sentry was loaded, at any sample rate.
describe('Vercel AI streamText with tools on a real provider (v7)', () => {
  const additionalDependencies = { ai: '^7.0.174', '@ai-sdk/openai': '^4.0.118' };

  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-openai-stream-tools.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('returns the streamed text and records the model and tool calls', async () => {
        await createRunner()
          .unordered()
          .expect({
            event: event => {
              expect(event.message).toBe('streamText returned: Sunny, 72°F.');
            },
          })
          .expect({
            span: container => {
              const modelCalls = container.items.filter(
                span => span.attributes[SENTRY_OP]?.value === GEN_AI_GENERATE_CONTENT,
              );
              expect(modelCalls).toHaveLength(2);
              for (const modelCall of modelCalls) {
                expect(modelCall.status).toBe('ok');
                expect(modelCall.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
                expect(modelCall.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
              }

              const toolSpan = container.items.find(span => span.attributes[SENTRY_OP]?.value === GEN_AI_EXECUTE_TOOL);
              expect(toolSpan?.status).toBe('ok');
              expect(toolSpan?.attributes[GEN_AI_TOOL_NAME]?.value).toBe('getWeather');
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies },
  );

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-openai-stream-tools.mjs',
    'instrument-unsampled.mjs',
    (createRunner, test) => {
      test('returns the streamed text in an unsampled trace', async () => {
        await createRunner()
          .unordered()
          .expect({
            event: event => {
              expect(event.message).toBe('streamText returned: Sunny, 72°F.');
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies },
  );
});
