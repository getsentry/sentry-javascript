import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_USAGE_INPUT_TOKENS,
} from '@sentry/conventions/attributes';

import { afterAll, describe, expect } from 'vitest';

import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmTests } from '../../../utils/runner';

const CONTENT_ATTRIBUTES = [
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
];

// The pi packages declare `engines.node >= 22.19`.
describe.runIf(supports({ min: 22 }))('pi-durable integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    for (const [setting, recording] of [
      ['the client', 'off'],
      ['`piDurableIntegration`', 'integration-off'],
    ]) {
      test(`records no message content when ${setting} turns gen_ai recording off`, async () => {
        await createRunner()
          .withEnv({ PI_DURABLE_RECORDING: recording })
          .unordered()
          .expect({
            span: container => {
              const spans = container.items;
              expect(spans).toHaveLength(5);
              for (const span of spans) {
                for (const attribute of CONTENT_ATTRIBUTES) {
                  expect(span.attributes[attribute]).toBeUndefined();
                }
              }
              const weather = spans.find(span => span.name === 'execute_tool get_weather')!;
              expect(weather.attributes[GEN_AI_TOOL_DESCRIPTION]?.value).toBe('Get the current weather for a city.');
              expect(
                spans.find(span => span.name === 'chat faux-model')!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value,
              ).toBeGreaterThan(0);
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              for (const span of container.items) {
                for (const attribute of CONTENT_ATTRIBUTES) {
                  expect(span.attributes[attribute]).toBeUndefined();
                }
              }
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);
              expect(container.items[0]!.name).toBe('pi-durable-request');
            },
          })
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]?.value).toBe('broken tool');
            },
          })
          .start()
          .completed();
      });
    }
  });

  createEsmTests(
    __dirname,
    'scenario-recording-functions.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per call when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const recorded = container.items
                .filter(span => /^(chat|execute_tool) /.test(span.name))
                .sort((a, b) => a.start_timestamp - b.start_timestamp)
                .map(({ name, attributes }) => [
                  name,
                  GEN_AI_INPUT_MESSAGES in attributes || GEN_AI_TOOL_CALL_ARGUMENTS in attributes,
                  GEN_AI_OUTPUT_MESSAGES in attributes || GEN_AI_TOOL_CALL_RESULT in attributes,
                ]);
              expect(recorded).toEqual([
                ['chat faux-model', true, true],
                ['execute_tool get_weather', false, false],
                ['chat faux-model', true, false],
              ]);
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmTests(
    __dirname,
    'scenario-recording-functions.mjs',
    'instrument-with-span-hooks.mjs',
    (createRunner, test) => {
      test('runs the span hooks of the model and tool calls', async () => {
        await createRunner()
          .expect({
            span: container => {
              const hooks = container.items
                .filter(span => /^(chat|execute_tool) /.test(span.name))
                .sort((a, b) => a.start_timestamp - b.start_timestamp)
                .map(({ attributes }) => [attributes['test.start']?.value, attributes['test.end']?.value]);
              expect(hooks).toEqual([
                ['chat', 'toolUse'],
                ['Berlin', 'It is sunny in Berlin.'],
                ['chat', 'stop'],
              ]);
            },
          })
          .start()
          .completed();
      });
    },
  );
});
