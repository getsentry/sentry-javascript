import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_EVALUATE } from '@sentry/conventions/op';
import { GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { createEsmTests } from '../../../../utils/runner/createEsmAndCjsTests';

describe('LangChain integration (v1)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates langchain related spans with genAI recording disabled', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(
          span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain',
        );
        expect(spans).toHaveLength(3);
        expect(spans.map(span => span.name).sort()).toEqual([
          'chat claude-3-5-sonnet-20241022',
          'chat claude-3-opus-20240229',
          'chat error-model',
        ]);

        const sonnetSpan = spans.find(span => span.name === 'chat claude-3-5-sonnet-20241022');
        expect(sonnetSpan!.status).toBe('ok');
        expect(sonnetSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(sonnetSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(sonnetSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
        expect(sonnetSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
        expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-5-sonnet-20241022');
        expect(sonnetSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
        expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
        expect(sonnetSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
        expect(sonnetSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
        expect(sonnetSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);
        expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_ID]).toBeDefined();
        expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toBeDefined();
        expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]).toBeDefined();

        const opusSpan = spans.find(span => span.name === 'chat claude-3-opus-20240229');
        expect(opusSpan!.status).toBe('ok');
        expect(opusSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(opusSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(opusSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
        expect(opusSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-opus-20240229');
        expect(opusSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.9);
        expect(opusSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.95);
        expect(opusSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(200);
        expect(opusSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
        expect(opusSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
        expect(opusSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);

        const errorSpan = spans.find(span => span.name === 'chat error-model');
        expect(errorSpan!.status).toBe('error');
        expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(errorSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
        expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates langchain related spans with genAI recording enabled', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(
          span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain',
        );
        expect(spans).toHaveLength(3);
        expect(spans.map(span => span.name).sort()).toEqual([
          'chat claude-3-5-sonnet-20241022',
          'chat claude-3-opus-20240229',
          'chat error-model',
        ]);

        const sonnetSpan = spans.find(span => span.name === 'chat claude-3-5-sonnet-20241022');
        expect(sonnetSpan!.status).toBe('ok');
        expect(sonnetSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(sonnetSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(sonnetSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
        expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-5-sonnet-20241022');
        expect(sonnetSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
        expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
        expect(sonnetSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
        expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();
        expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_ID]).toBeDefined();
        expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toBeDefined();
        expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]).toBeDefined();
        expect(sonnetSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
        expect(sonnetSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
        expect(sonnetSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);

        const opusSpan = spans.find(span => span.name === 'chat claude-3-opus-20240229');
        expect(opusSpan!.status).toBe('ok');
        expect(opusSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
        expect(opusSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-opus-20240229');
        expect(opusSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.9);
        expect(opusSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.95);
        expect(opusSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(200);
        expect(opusSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
        expect(opusSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();
        expect(opusSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
        expect(opusSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
        expect(opusSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);

        const errorSpan = spans.find(span => span.name === 'chat error-model');
        expect(errorSpan!.status).toBe('error');
        expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
        expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
        expect(errorSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-tools.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates langchain spans with tool calls', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(
          span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain',
        );
        expect(spans).toHaveLength(1);
        const [firstSpan] = spans;

        // [0] chat with tool_use stop reason
        expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
        expect(firstSpan!.status).toBe('ok');
        expect(firstSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(firstSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(firstSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
        expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-5-sonnet-20241022');
        expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
        expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(150);
        expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(20);
        expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(30);
        expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(50);
        expect(firstSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('tool_use');
        expect(firstSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toBeDefined();
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-conversation-id.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('derives gen_ai.conversation.id from the invoke config and lets a scope id win', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(
          span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain',
        );
        expect(spans).toHaveLength(4);
        const ids = spans
          .sort((a, b) => a.start_timestamp - b.start_timestamp)
          .map(span => span.attributes[GEN_AI_CONVERSATION_ID]?.value);
        expect(ids).toEqual(['thread_from_config', 'session_from_config', 'conversation_from_scope', undefined]);
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-typesafe-classifier.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records a TypeSafeClassifier run as a gen_ai.evaluate span', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(
          span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain',
        );
        expect(spans.map(span => span.name)).toEqual(['evaluate jev-latest', 'evaluate jev-latest']);

        const [evaluateSpan, messageEvaluateSpan] = spans.sort((a, b) => a.start_timestamp - b.start_timestamp);
        expect(evaluateSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_EVALUATE);
        expect(evaluateSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(evaluateSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('evaluate');
        expect(evaluateSpan.attributes[GEN_AI_PROVIDER_NAME].value).toBe('typesafe');
        expect(evaluateSpan.attributes[GEN_AI_REQUEST_MODEL].value).toBe('jev-latest');
        expect(evaluateSpan.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('jev-1.13');
        expect(evaluateSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(30);
        expect(evaluateSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(2);
        expect(evaluateSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(32);
        expect(JSON.parse(evaluateSpan.attributes[GEN_AI_INPUT_MESSAGES].value)).toEqual([
          {
            type: 'evaluation',
            state: 'My payouts have been failing.',
            questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
          },
        ]);
        // A message is recorded as the transcript line the classifier sends, not as LangChain's serialized form.
        expect(JSON.parse(messageEvaluateSpan!.attributes[GEN_AI_INPUT_MESSAGES].value)).toEqual([
          {
            type: 'evaluation',
            state: 'user: My card was charged twice.',
            questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
          },
        ]);
        expect(JSON.parse(evaluateSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value)).toEqual([
          { type: 'evaluation', answers: { urgent: { type: 'noul', noul: 0.9 } } },
        ]);
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/typesafe': '^0.0.2',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-typesafe-classifier-inherited-callbacks.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('keeps the parent run callbacks for a TypeSafeClassifier called without config', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = await spansPromise;
        const segment = spans.find(span => span.is_segment && span.name === 'main');
        expect(segment!.attributes['test.recorded_runs'].value).toBe('RunnableLambda:root,TypeSafeClassifier:child');
        expect(spans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_EVALUATE)).toHaveLength(1);
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/typesafe': '^0.0.2',
        '@langchain/langgraph': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-typesafe-model-router.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records the Jev model router call inside a createAgent run', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              const evaluateSpan = container.items.find(span => span.attributes[SENTRY_OP]?.value === GEN_AI_EVALUATE)!;
              const chatSpan = container.items.find(span => span.name === 'chat claude-3-5-haiku-20241022')!;

              // The router classifies in `beforeAgent`, inside the agent run, where other chain steps are skipped.
              expect(evaluateSpan.name).toBe('evaluate jev-latest');
              expect(evaluateSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
              expect(evaluateSpan.attributes[GEN_AI_AGENT_NAME].value).toBe('support_agent');
              expect(evaluateSpan.parent_span_id).toBe(chatSpan.parent_span_id);
              expect(JSON.parse(evaluateSpan.attributes[GEN_AI_INPUT_MESSAGES].value)).toEqual([
                {
                  type: 'evaluation',
                  // The router passes the latest human message, which the classifier sends as a transcript line.
                  state: 'user: Where is my refund?',
                  questions: {
                    model_route: {
                      type: 'choice',
                      instructions: 'Pick the model for this request.',
                      criteria: { fast: 'Simple requests', smart: 'Complex requests' },
                    },
                  },
                },
              ]);
              expect(JSON.parse(evaluateSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value)).toEqual([
                {
                  type: 'evaluation',
                  answers: {
                    model_route: {
                      type: 'choice',
                      choice: 'fast',
                      probabilities: { fast: 0.9, smart: 0.1 },
                      confidence: 0.8,
                    },
                  },
                },
              ]);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
        '@langchain/typesafe': '0.0.2',
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-openai-before-langchain.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('demonstrates timing issue with duplicate spans', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(
          span =>
            span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain' ||
            span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.anthropic',
        );
        expect(spans).toHaveLength(2);
        const anthropicSpan = spans.find(span => span.attributes[SENTRY_ORIGIN].value === 'auto.ai.anthropic');
        expect(anthropicSpan!.name).toBe('chat claude-3-5-sonnet-20241022');

        const langchainSpan = spans.find(span => span.attributes[SENTRY_ORIGIN].value === 'auto.ai.langchain');
        expect(langchainSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-init-chat-model.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates langchain spans using initChatModel with OpenAI', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(
          span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain',
        );
        expect(spans).toHaveLength(3);
        expect(spans.map(span => span.name).sort()).toEqual(['chat error-model', 'chat gpt-3.5-turbo', 'chat gpt-4o']);

        const gpt4oSpan = spans.find(span => span.name === 'chat gpt-4o');
        expect(gpt4oSpan!.status).toBe('ok');
        expect(gpt4oSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(gpt4oSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(gpt4oSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
        expect(gpt4oSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
        expect(gpt4oSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gpt-4o');
        expect(gpt4oSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
        expect(gpt4oSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
        expect(gpt4oSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
        expect(gpt4oSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
        expect(gpt4oSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);
        expect(gpt4oSpan!.attributes[GEN_AI_RESPONSE_ID]).toBeDefined();
        expect(gpt4oSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-4o');
        expect(gpt4oSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('stop');

        const gpt35Span = spans.find(span => span.name === 'chat gpt-3.5-turbo');
        expect(gpt35Span!.status).toBe('ok');
        expect(gpt35Span!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(gpt35Span!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(gpt35Span!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
        expect(gpt35Span!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gpt-3.5-turbo');
        expect(gpt35Span!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.5);
        expect(gpt35Span!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
        expect(gpt35Span!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
        expect(gpt35Span!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);
        expect(gpt35Span!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-3.5-turbo');
        expect(gpt35Span!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('stop');

        const errorSpan = spans.find(span => span.name === 'chat error-model');
        expect(errorSpan!.status).toBe('error');
        expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(errorSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
        expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/openai': '^1.0.0',
      },
    },
  );
});
