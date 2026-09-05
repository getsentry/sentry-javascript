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
} from '@sentry/conventions/attributes';
import { afterAll, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// `@mastra/core` declares `engines.node >= 22.13`, and the CI matrix still includes 20.19.
conditionalTest({ min: 22 })('Mastra integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates invoke_agent and chat spans following the gen_ai conventions', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'mastra-test' } })
        .expect({
          span: container => {
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat gpt-4o-mini',
              'invoke_agent weather_agent',
            ]);

            const agentSpan = container.items.find(span => span.name === 'invoke_agent weather_agent')!;
            expect(agentSpan.status).toBe('ok');
            expect(agentSpan.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(agentSpan.attributes['sentry.origin'].value).toBe('auto.ai.mastra');
            expect(agentSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('invoke_agent');
            expect(agentSpan.attributes[GEN_AI_AGENT_NAME].value).toBe('weather_agent');
            expect(agentSpan.attributes[GEN_AI_PIPELINE_NAME].value).toBe('weather_agent');
            expect(agentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(12);
            expect(agentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(7);
            expect(agentSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(19);
            expect(agentSpan.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-4o-mini');

            const chatSpan = container.items.find(span => span.name === 'chat gpt-4o-mini')!;
            expect(chatSpan.status).toBe('ok');
            expect(chatSpan.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(chatSpan.attributes['sentry.origin'].value).toBe('auto.ai.mastra');
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
        .expect({ transaction: { transaction: 'mastra-test' } })
        .expect({
          span: container => {
            for (const span of container.items) {
              expect(span.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
              expect(span.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
              expect(span.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records prompts and responses when genAI recording is on', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'mastra-test' } })
        .expect({
          span: container => {
            const agentSpan = container.items.find(span => span.name === 'invoke_agent weather_agent')!;
            expect(agentSpan.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe('You report the weather.');
            expect(agentSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('What is the weather in Berlin?');
            expect(agentSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('It is 22C in Berlin.');

            const chatSpan = container.items.find(span => span.name === 'chat gpt-4o-mini')!;
            expect(chatSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('What is the weather in Berlin?');
            expect(chatSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('It is 22C in Berlin.');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates an execute_tool span parented onto the generation', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'mastra-test' } })
        .expect({
          span: container => {
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat gpt-4o-mini',
              'execute_tool get_weather',
              'invoke_agent weather_agent',
            ]);

            const toolSpan = container.items.find(span => span.name === 'execute_tool get_weather')!;
            expect(toolSpan.status).toBe('ok');
            expect(toolSpan.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
            expect(toolSpan.attributes['sentry.origin'].value).toBe('auto.ai.mastra');
            expect(toolSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('execute_tool');
            expect(toolSpan.attributes[GEN_AI_TOOL_NAME].value).toBe('get_weather');
            expect(toolSpan.attributes[GEN_AI_TOOL_CALL_ARGUMENTS].value).toContain('Berlin');
            expect(toolSpan.attributes[GEN_AI_TOOL_CALL_RESULT].value).toContain('22');

            const chatSpan = container.items.find(span => span.name === 'chat gpt-4o-mini')!;
            expect(toolSpan.parent_span_id).toBe(chatSpan.span_id);

            const agentSpan = container.items.find(span => span.name === 'invoke_agent weather_agent')!;
            expect(agentSpan.attributes[GEN_AI_TOOL_DEFINITIONS].value).toContain('get_weather');
            expect(agentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(50);
            expect(agentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(13);
            expect(agentSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(63);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-workflow.mjs', 'instrument.mjs', (createRunner, test) => {
    test('exports the workflow run but drops workflow steps, which have no conventional op', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'mastra-test' } })
        .expect({
          span: container => {
            expect(container.items.map(span => span.name)).toEqual(['invoke_agent math_workflow']);

            const workflowSpan = container.items[0]!;
            expect(workflowSpan.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(workflowSpan.attributes[GEN_AI_PIPELINE_NAME].value).toBe('math_workflow');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-auto.mjs', 'instrument.mjs', (createRunner, test) => {
    test('auto-instruments a Mastra app that configured no observability at all', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'mastra-test' } })
        .expect({
          span: container => {
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat gpt-4o-mini',
              'invoke_agent weather_agent',
            ]);
            for (const span of container.items) {
              expect(span.attributes['sentry.origin'].value).toBe('auto.ai.mastra');
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-community-exporter.mjs', 'instrument.mjs', (createRunner, test) => {
    test('still exports its own spans when the community @mastra/sentry exporter is present', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'mastra-test' } })
        .expect({
          span: container => {
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat gpt-4o-mini',
              'invoke_agent weather_agent',
            ]);
          },
        })
        .start()
        .completed();
    });
  });
  createEsmAndCjsTests(__dirname, 'scenario-auto.mjs', 'instrument-no-bootstrap.mjs', (createRunner, test) => {
    test('leaves an unconfigured app alone when bootstrapObservability is false', async () => {
      await createRunner()
        .expect({
          transaction: event => {
            expect(event.transaction).toBe('mastra-test');
            const genAiSpans = (event.spans ?? []).filter(span => span.op?.startsWith('gen_ai.'));
            expect(genAiSpans).toEqual([]);
          },
        })
        .start()
        .completed();
    });
  });
});
