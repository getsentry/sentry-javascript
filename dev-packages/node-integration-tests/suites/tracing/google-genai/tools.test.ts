import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_AVAILABLE_TOOLS_JSON =
    '[{"name":"controlLight","parametersJsonSchema":{"type":"object","properties":{"brightness":{"type":"number"},"colorTemperature":{"type":"string"}},"required":["brightness","colorTemperature"]}}]';

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates google genai related spans with tool calls', async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.google_genai',
            );
            expect(spans).toHaveLength(3);
            const nonStreamingToolsSpan = spans.find(
              span =>
                span.attributes[GEN_AI_TOOL_DEFINITIONS]?.value === EXPECTED_AVAILABLE_TOOLS_JSON &&
                span.attributes[GEN_AI_RESPONSE_STREAMING] === undefined,
            );
            expect(nonStreamingToolsSpan!.name).toBe('generate_content gemini-2.0-flash-001');
            expect(nonStreamingToolsSpan!.status).toBe('ok');
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();
            expect(JSON.parse(nonStreamingToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS].value as string)).toEqual([
              {
                id: 'call_light_control_1',
                name: 'controlLight',
                args: { brightness: 0.3, colorTemperature: 'warm' },
              },
            ]);
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
              JSON.stringify([
                {
                  role: 'assistant',
                  parts: [
                    { type: 'text', content: 'I need to check the light status first.' },
                    {
                      type: 'tool_call',
                      id: 'call_light_control_1',
                      name: 'controlLight',
                      arguments: '{"brightness":0.3,"colorTemperature":"warm"}',
                    },
                  ],
                },
              ]),
            );
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(15);
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(8);
            expect(nonStreamingToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(23);

            const streamingToolsSpan = spans.find(
              span =>
                span.attributes[GEN_AI_TOOL_DEFINITIONS]?.value === EXPECTED_AVAILABLE_TOOLS_JSON &&
                span.attributes[GEN_AI_RESPONSE_STREAMING]?.value === true,
            );
            expect(streamingToolsSpan!.name).toBe('generate_content gemini-2.0-flash-001');
            expect(streamingToolsSpan!.status).toBe('ok');
            expect(streamingToolsSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
            expect(streamingToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(streamingToolsSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();
            expect(JSON.parse(streamingToolsSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS].value as string)).toEqual([
              {
                id: 'call_light_stream_1',
                name: 'controlLight',
                args: { brightness: 0.5, colorTemperature: 'cool' },
              },
            ]);
            // The text arrives either side of the tool call, so it stays two parts.
            expect(streamingToolsSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
              JSON.stringify([
                {
                  role: 'assistant',
                  parts: [
                    { type: 'text', content: 'Let me control the lights for you.' },
                    {
                      type: 'tool_call',
                      id: 'call_light_stream_1',
                      name: 'controlLight',
                      arguments: '{"brightness":0.5,"colorTemperature":"cool"}',
                    },
                    { type: 'text', content: ' Done!' },
                  ],
                },
              ]),
            );
            expect(streamingToolsSpan!.attributes[GEN_AI_RESPONSE_ID].value).toBe('mock-response-tools-id');
            expect(streamingToolsSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gemini-2.0-flash-001');
            expect(streamingToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(12);
            expect(streamingToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(10);
            expect(streamingToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(22);

            const noToolsSpan = spans.find(span => span.attributes[GEN_AI_TOOL_DEFINITIONS] === undefined);
            expect(noToolsSpan!.name).toBe('generate_content gemini-2.0-flash-001');
            expect(noToolsSpan!.status).toBe('ok');
            expect(noToolsSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
            expect(noToolsSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(noToolsSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();
            expect(noToolsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
            expect(noToolsSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
            expect(noToolsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);
          },
        })
        .start()
        .completed();
    });
  });
});
