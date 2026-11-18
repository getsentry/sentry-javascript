import {
  GEN_AI_AGENT_NAME,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { afterAll, expect, describe } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../../utils/runner';
import { supports } from '../../../../../utils';
import { join } from 'node:path';
import { MASTRA_DEPENDENCIES } from '../../dependencies';

describe.runIf(supports({ min: 22 }))('Mastra integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates invoke_agent and chat spans following the gen_ai conventions', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name).sort()).toEqual(['chat gpt-4o-mini', 'invoke_agent weather_agent']);

              const agentSpan = spans.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(agentSpan.status).toBe('ok');
              expect(agentSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_INVOKE_AGENT);
              expect(agentSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.mastra');
              expect(agentSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('invoke_agent');
              expect(agentSpan.attributes[GEN_AI_AGENT_NAME].value).toBe('weather_agent');
              expect(agentSpan.attributes[GEN_AI_PIPELINE_NAME].value).toBe('weather_agent');
              expect(agentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(12);
              expect(agentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(7);
              expect(agentSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(19);
              expect(agentSpan.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-4o-mini');

              const chatSpan = spans.find(span => span.name === 'chat gpt-4o-mini')!;
              expect(chatSpan.status).toBe('ok');
              expect(chatSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_CHAT);
              expect(chatSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.mastra');
              expect(chatSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
              expect(chatSpan.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gpt-4o-mini');
              expect(chatSpan.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
              expect(chatSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(19);

              expect(chatSpan.parent_span_id).toBe(agentSpan.span_id);
            },
          })
          .start()
          .completed();
      });

      test('omits prompts and responses when genAI recording is off', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans).toHaveLength(2);
              for (const span of spans) {
                expect(span.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
                expect(span.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
                expect(span.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
              }
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records prompts and responses when genAI recording is on', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              const agentSpan = spans.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(agentSpan.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe('You report the weather.');
              expect(agentSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('What is the weather in Berlin?');
              expect(agentSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('It is 22C in Berlin.');

              const chatSpan = spans.find(span => span.name === 'chat gpt-4o-mini')!;
              expect(chatSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('What is the weather in Berlin?');
              expect(chatSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('It is 22C in Berlin.');
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-tools.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates an execute_tool span parented onto the generation', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name).sort()).toEqual([
                'chat gpt-4o-mini',
                'execute_tool get_weather',
                'invoke_agent weather_agent',
              ]);

              const toolSpan = spans.find(span => span.name === 'execute_tool get_weather')!;
              expect(toolSpan.status).toBe('ok');
              expect(toolSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_EXECUTE_TOOL);
              expect(toolSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.mastra');
              expect(toolSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('execute_tool');
              expect(toolSpan.attributes[GEN_AI_TOOL_NAME].value).toBe('get_weather');
              expect(toolSpan.attributes[GEN_AI_TOOL_CALL_ARGUMENTS].value).toContain('Berlin');
              expect(toolSpan.attributes[GEN_AI_TOOL_CALL_RESULT].value).toContain('22');

              const chatSpan = spans.find(span => span.name === 'chat gpt-4o-mini')!;
              expect(toolSpan.parent_span_id).toBe(chatSpan.span_id);

              const agentSpan = spans.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(agentSpan.attributes[GEN_AI_TOOL_DEFINITIONS].value).toContain('get_weather');
              expect(agentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(50);
              expect(agentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(13);
              expect(agentSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(63);
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-workflow.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('exports the workflow run but drops workflow steps, which have no conventional op', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name)).toEqual(['invoke_agent math_workflow']);

              const workflowSpan = spans[0]!;
              expect(workflowSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_INVOKE_AGENT);
              expect(workflowSpan.attributes[GEN_AI_PIPELINE_NAME].value).toBe('math_workflow');
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );
});
