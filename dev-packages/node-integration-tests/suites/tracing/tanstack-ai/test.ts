import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_COST_TOTAL_TOKENS,
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import type { SerializedStreamedSpan } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const TANSTACK_AI_DEPENDENCIES = {
  additionalDependencies: {
    '@tanstack/ai': '1.0.0',
    '@tanstack/ai-openai': '1.0.0',
    '@tanstack/ai-openrouter': '1.0.0',
    // In the range of `@tanstack/ai-openai`, so that the scenarios and the adapter share one copy.
    openai: '7.32.0',
  },
};

const ORIGIN = 'auto.ai.tanstack_ai';

type Spans = SerializedStreamedSpan[];

function attr(span: SerializedStreamedSpan | undefined, key: string): unknown {
  return span?.attributes?.[key]?.value;
}

function expectAgentTree(spans: Spans): void {
  const main = spans.find(span => span.name === 'main')!;
  expect(main.is_segment).toBe(true);

  // Counted: an explicit middleware plus the injected one would double every span.
  expect(spans.filter(span => attr(span, 'sentry.origin') === ORIGIN)).toHaveLength(4);

  const agent = spans.find(span => span.name === 'invoke_agent')!;
  expect(attr(agent, 'sentry.op')).toBe('gen_ai.invoke_agent');
  expect(attr(agent, GEN_AI_PROVIDER_NAME)).toBe('fake');
  expect(attr(agent, GEN_AI_REQUEST_MODEL)).toBe('fake-model');
  expect(attr(agent, GEN_AI_CONVERSATION_ID)).toBe('thread-1');
  expect(agent.parent_span_id).toBe(main.span_id);

  const chats = spans
    .filter(span => span.name === 'chat fake-model')
    .sort((a, b) => a.start_timestamp - b.start_timestamp);
  expect(chats).toHaveLength(2);
  for (const chat of chats) {
    expect(attr(chat, 'sentry.op')).toBe('gen_ai.chat');
    expect(attr(chat, GEN_AI_RESPONSE_MODEL)).toBe('fake-model');
    expect(chat.parent_span_id).toBe(agent.span_id);
  }
  expect(chats.map(chat => attr(chat, GEN_AI_RESPONSE_FINISH_REASONS))).toEqual(['["tool_calls"]', '["stop"]']);
  expect(attr(agent, GEN_AI_RESPONSE_MODEL)).toBe('fake-model');

  // The fake caches per thread: the first call writes the whole prompt, the second reads the
  // repeated prefix back.
  const [first, second] = chats.map(chat => ({
    input: attr(chat, GEN_AI_USAGE_INPUT_TOKENS) as number,
    output: attr(chat, GEN_AI_USAGE_OUTPUT_TOKENS) as number,
    cacheRead: attr(chat, GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS) as number,
  }));
  expect(first!.input).toBeGreaterThan(0);
  expect(attr(chats[0], GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS)).toBe(first!.input);
  expect(second!.cacheRead).toBeGreaterThan(0);
  // The agent span sums both model calls.
  expect(attr(agent, GEN_AI_USAGE_INPUT_TOKENS)).toBe(first!.input + second!.input);
  expect(attr(agent, GEN_AI_USAGE_OUTPUT_TOKENS)).toBe(first!.output + second!.output);
  expect(attr(agent, GEN_AI_USAGE_TOTAL_TOKENS)).toBe(first!.input + first!.output + second!.input + second!.output);
  expect(attr(agent, GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS)).toBe(second!.cacheRead);

  const tool = spans.find(span => span.name === 'execute_tool get_weather')!;
  expect(tool.status).toBe('ok');
  // Each model call ends before the tool that it asked for runs.
  expect(chats[0]!.end_timestamp).toBeLessThanOrEqual(tool.start_timestamp);
  expect(tool.end_timestamp).toBeLessThanOrEqual(chats[1]!.start_timestamp);
  expect(attr(tool, 'sentry.op')).toBe('gen_ai.execute_tool');
  expect(attr(tool, GEN_AI_TOOL_NAME)).toBe('get_weather');
  expect(tool.parent_span_id).toBe(agent.span_id);

  // Work inside the tool parents under the tool span, not beside it.
  const lookup = spans.find(span => span.name === 'weather-lookup')!;
  expect(lookup.parent_span_id).toBe(tool.span_id);
}

describe('TanStack AI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      // `@tanstack/ai` is ESM-only.
      if (mode === 'cjs') {
        return;
      }

      test('injects the middleware into chat() calls that carry none', async () => {
        await createRunner()
          .expect({
            span: container => {
              expectAgentTree(container.items);

              const chats = container.items
                .filter(span => span.name === 'chat fake-model')
                .sort((a, b) => a.start_timestamp - b.start_timestamp);
              expect(JSON.parse(String(attr(chats[0], GEN_AI_INPUT_MESSAGES)))).toEqual([
                { role: 'user', parts: [{ type: 'text', content: 'What is the weather in Vienna?' }] },
              ]);
              expect(attr(chats[0], GEN_AI_SYSTEM_INSTRUCTIONS)).toBe('You are a helpful assistant.');
              expect(JSON.parse(String(attr(chats[0], GEN_AI_TOOL_DEFINITIONS)))[0]).toMatchObject({
                name: 'get_weather',
                description: 'Get the current weather for a city.',
              });
              expect(JSON.parse(String(attr(chats[0], GEN_AI_OUTPUT_MESSAGES)))).toEqual([
                {
                  role: 'assistant',
                  parts: [
                    { type: 'text', content: 'Let me check.' },
                    { type: 'tool_call', id: expect.any(String), name: 'get_weather', arguments: '{"city":"Vienna"}' },
                  ],
                  finish_reason: 'tool_calls',
                },
              ]);
              const toolCallId = JSON.parse(String(attr(chats[0], GEN_AI_OUTPUT_MESSAGES)))[0].parts[1].id;
              const secondInput = JSON.parse(String(attr(chats[1], GEN_AI_INPUT_MESSAGES)));
              expect(secondInput.map((message: { role: string }) => message.role)).toEqual([
                'user',
                'assistant',
                'tool',
              ]);

              // The agent span has the input of the run and the answer of its last model call.
              const agent = container.items.find(span => span.name === 'invoke_agent');
              expect(attr(agent, GEN_AI_INPUT_MESSAGES)).toBe(attr(chats[0], GEN_AI_INPUT_MESSAGES));
              expect(attr(agent, GEN_AI_SYSTEM_INSTRUCTIONS)).toBe('You are a helpful assistant.');
              expect(JSON.parse(String(attr(agent, GEN_AI_OUTPUT_MESSAGES)))).toEqual([
                {
                  role: 'assistant',
                  parts: [{ type: 'text', content: 'It is 21 degrees in Vienna.' }],
                  finish_reason: 'stop',
                },
              ]);

              const tool = container.items.find(span => span.name === 'execute_tool get_weather');
              expect(attr(tool, GEN_AI_TOOL_CALL_ID_ATTRIBUTE)).toBe(toolCallId);
              expect(attr(tool, GEN_AI_TOOL_CALL_ARGUMENTS)).toBe('{"city":"Vienna"}');
              expect(attr(tool, GEN_AI_TOOL_CALL_RESULT)).toBe('{"city":"Vienna","temperature":21}');
            },
          })
          .start()
          .completed();
      });

      test('records the same spans when the app consumes the stream', async () => {
        await createRunner()
          .withEnv({ STREAM: '1' })
          .expect({ span: container => expectAgentTree(container.items) })
          .start()
          .completed();
      });

      test('does not add a second middleware when the app passes one', async () => {
        await createRunner()
          .withEnv({ MIDDLEWARE: 'manual' })
          .expect({ span: container => expectAgentTree(container.items) })
          .start()
          .completed();
      });

      test('records the tool span when an earlier middleware changes the tool arguments', async () => {
        await createRunner()
          .withEnv({ MIDDLEWARE: 'transform-args' })
          .expect({
            span: container => {
              expectAgentTree(container.items);
              const tool = container.items.find(span => span.name === 'execute_tool get_weather');
              expect(attr(tool, GEN_AI_TOOL_CALL_ARGUMENTS)).toBe('{"city":"Vienna","unit":"celsius"}');
            },
          })
          .start()
          .completed();
      });
    },
    TANSTACK_AI_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-no-auto.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('records the same spans from an explicit middleware alone', async () => {
        await createRunner()
          .withEnv({ MIDDLEWARE: 'manual' })
          .expect({ span: container => expectAgentTree(container.items) })
          .start()
          .completed();
      });

      test('records nothing without the integration or an explicit middleware', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.name === 'main')).toBeDefined();
              expect(container.items.filter(span => attr(span, 'sentry.origin') === ORIGIN)).toHaveLength(0);
            },
          })
          .start()
          .completed();
      });
    },
    TANSTACK_AI_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-openai.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('reports the provider call once, with the HTTP request under the chat span', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items;
              const direct = spans.find(span => span.name === 'direct')!;
              const chats = spans.filter(span => attr(span, 'sentry.op') === 'gen_ai.chat');
              // The OpenAI integration is skipped for TanStack's model call, but not for the direct call after it.
              expect(chats.map(span => attr(span, 'sentry.origin')).sort()).toEqual(['auto.ai.openai', ORIGIN]);
              const chat = chats.find(span => attr(span, 'sentry.origin') === ORIGIN)!;
              const directChat = chats.find(span => attr(span, 'sentry.origin') === 'auto.ai.openai')!;
              expect(directChat.parent_span_id).toBe(direct.span_id);
              // TanStack reports the adapter's name, which is per API, not the vendor.
              expect(attr(chat, GEN_AI_PROVIDER_NAME)).toBe('openai-chat');
              expect(attr(chat, GEN_AI_REQUEST_MODEL)).toBe('gpt-4o');
              expect(attr(chat, GEN_AI_RESPONSE_MODEL)).toBe('gpt-4o-2024-08-06');
              expect(attr(chat, GEN_AI_RESPONSE_ID)).toBe('chatcmpl-1');
              const agent = spans.find(span => attr(span, 'sentry.op') === 'gen_ai.invoke_agent');
              expect(attr(agent, GEN_AI_RESPONSE_ID)).toBe('chatcmpl-1');
              expect(attr(chat, GEN_AI_USAGE_INPUT_TOKENS)).toBe(20);
              expect(attr(chat, GEN_AI_USAGE_OUTPUT_TOKENS)).toBe(5);
              expect(attr(chat, GEN_AI_USAGE_TOTAL_TOKENS)).toBe(25);
              expect(attr(chat, GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS)).toBe(8);
              expect(attr(chat, GEN_AI_USAGE_REASONING_OUTPUT_TOKENS)).toBe(2);

              const requests = spans.filter(span => attr(span, 'sentry.op') === 'http.client');
              expect(requests.map(span => span.parent_span_id).sort()).toEqual(
                [chat.span_id, directChat.span_id].sort(),
              );
            },
          })
          .start()
          .completed();
      });

      test('skips the OpenAI integration also while the app reads the stream', async () => {
        await createRunner()
          .withEnv({ STREAM: '1' })
          .expect({
            span: container => {
              const spans = container.items;
              const direct = spans.find(span => span.name === 'direct')!;
              const chats = spans.filter(span => attr(span, 'sentry.op') === 'gen_ai.chat');
              expect(chats.map(span => attr(span, 'sentry.origin')).sort()).toEqual(['auto.ai.openai', ORIGIN]);
              const directChat = chats.find(span => attr(span, 'sentry.origin') === 'auto.ai.openai')!;
              expect(directChat.parent_span_id).toBe(direct.span_id);
            },
          })
          .start()
          .completed();
      });
    },
    TANSTACK_AI_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-interrupt.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      // TanStack calls no terminal hook for a run that pauses at an interrupt before or after a model call.
      test('ends the spans of a run that pauses at an interrupt before the model call', async () => {
        await createRunner()
          .withEnv({ INTERRUPT: 'beforeModel' })
          .expect({
            span: container => {
              const agent = container.items.find(span => span.name === 'invoke_agent');
              const chat = container.items.find(span => span.name === 'chat fake-model');
              expect(agent?.status).toBe('ok');
              expect(chat?.parent_span_id).toBe(agent?.span_id);
            },
          })
          .start()
          .completed();
      });

      test('ends the spans of a run that pauses at an interrupt after the model call', async () => {
        await createRunner()
          .withEnv({ INTERRUPT: 'afterModel' })
          .expect({
            span: container => {
              const agent = container.items.find(span => span.name === 'invoke_agent');
              const chat = container.items.find(span => span.name === 'chat fake-model');
              expect(agent?.status).toBe('ok');
              expect(chat?.parent_span_id).toBe(agent?.span_id);
              expect(attr(chat, GEN_AI_RESPONSE_FINISH_REASONS)).toBe('["stop"]');
            },
          })
          .start()
          .completed();
      });
    },
    TANSTACK_AI_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-retry.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('ends a model call that a middleware retried with an error status', async () => {
        await createRunner()
          .expect({
            span: container => {
              const agent = container.items.find(span => span.name === 'invoke_agent');
              const chats = container.items
                .filter(span => span.name === 'chat fake-model')
                .sort((a, b) => a.start_timestamp - b.start_timestamp);
              expect(chats.map(chat => chat.status)).toEqual(['error', 'ok']);
              expect(chats.map(chat => chat.parent_span_id)).toEqual([agent?.span_id, agent?.span_id]);
              expect(agent?.status).toBe('ok');
            },
          })
          .start()
          .completed();
      });
    },
    TANSTACK_AI_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-provider-error.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('ends the spans with an error status when the provider call fails', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items;
              const agent = spans.find(span => attr(span, 'sentry.op') === 'gen_ai.invoke_agent');
              const chat = spans.find(span => attr(span, 'sentry.op') === 'gen_ai.chat');
              expect(agent?.status).toBe('error');
              expect(chat?.status).toBe('error');
              expect(chat?.parent_span_id).toBe(agent?.span_id);
            },
          })
          .start()
          .completed();
      });
    },
    TANSTACK_AI_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-embed.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('records an embeddings span, with the provider request under it', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items;
              const main = spans.find(span => span.name === 'main')!;
              const direct = spans.find(span => span.name === 'direct')!;
              const embeddings = spans.filter(span => attr(span, 'sentry.op') === 'gen_ai.embeddings');
              // The OpenAI integration is skipped for TanStack's call, but not for the direct call after it.
              expect(embeddings.map(span => attr(span, 'sentry.origin')).sort()).toEqual(['auto.ai.openai', ORIGIN]);
              const embedding = embeddings.find(span => attr(span, 'sentry.origin') === ORIGIN)!;
              const directEmbedding = embeddings.find(span => attr(span, 'sentry.origin') === 'auto.ai.openai')!;
              expect(directEmbedding.parent_span_id).toBe(direct.span_id);
              expect(embedding.name).toBe('embeddings text-embedding-3-small');
              expect(embedding.parent_span_id).toBe(main.span_id);
              expect(embedding.status).toBe('ok');
              expect(attr(embedding, 'sentry.origin')).toBe(ORIGIN);
              expect(attr(embedding, GEN_AI_OPERATION_NAME)).toBe('embeddings');
              expect(attr(embedding, GEN_AI_PROVIDER_NAME)).toBe('openai');
              expect(attr(embedding, GEN_AI_REQUEST_MODEL)).toBe('text-embedding-3-small');
              expect(attr(embedding, GEN_AI_RESPONSE_MODEL)).toBe('text-embedding-3-small');
              expect(attr(embedding, GEN_AI_EMBEDDINGS_INPUT)).toBe('["a red guitar","a blue drum kit"]');
              expect(attr(embedding, GEN_AI_USAGE_INPUT_TOKENS)).toBe(8);
              expect(attr(embedding, GEN_AI_USAGE_TOTAL_TOKENS)).toBe(8);
              expect(attr(embedding, GEN_AI_USAGE_OUTPUT_TOKENS)).toBeUndefined();

              const requests = spans.filter(span => attr(span, 'sentry.op') === 'http.client');
              expect(requests.map(span => span.parent_span_id).sort()).toEqual(
                [embedding.span_id, directEmbedding.span_id].sort(),
              );
            },
          })
          .start()
          .completed();
      });
    },
    TANSTACK_AI_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-rerank.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      if (mode === 'cjs') {
        return;
      }

      test('records rerank spans with the usage, with the provider request under them', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items;
              const main = spans.find(span => span.name === 'main')!;
              const failed = spans.find(span => span.name === 'failed')!;
              const reranks = spans.filter(span => attr(span, 'sentry.op') === 'gen_ai.rerank');
              expect(reranks).toHaveLength(2);
              const rerank = reranks.find(span => span.parent_span_id === main.span_id)!;
              expect(rerank.name).toBe('rerank cohere/rerank-v3.5');
              expect(rerank.status).toBe('ok');
              expect(attr(rerank, 'sentry.origin')).toBe(ORIGIN);
              expect(attr(rerank, GEN_AI_OPERATION_NAME)).toBe('rerank');
              expect(attr(rerank, GEN_AI_PROVIDER_NAME)).toBe('openrouter');
              expect(attr(rerank, GEN_AI_REQUEST_MODEL)).toBe('cohere/rerank-v3.5');
              // The adapter reports no model, and makes the id itself when the response has none.
              expect(attr(rerank, GEN_AI_RESPONSE_MODEL)).toBeUndefined();
              expect(attr(rerank, GEN_AI_RESPONSE_ID)).toBeUndefined();
              expect(attr(rerank, GEN_AI_USAGE_TOTAL_TOKENS)).toBe(12);
              expect(attr(rerank, GEN_AI_USAGE_INPUT_TOKENS)).toBeUndefined();
              expect(attr(rerank, GEN_AI_COST_TOTAL_TOKENS)).toBe(0.002);

              // `rerank()` throws after the provider answered, and the provider bills the call.
              const failedRerank = reranks.find(span => span.parent_span_id === failed.span_id)!;
              expect(failedRerank.status).toBe('error');
              expect(attr(failedRerank, GEN_AI_USAGE_TOTAL_TOKENS)).toBe(12);
              expect(attr(failedRerank, GEN_AI_COST_TOTAL_TOKENS)).toBe(0.002);

              const requests = spans.filter(span => attr(span, 'sentry.op') === 'http.client');
              expect(requests.map(span => span.parent_span_id).sort()).toEqual(
                [rerank.span_id, failedRerank.span_id].sort(),
              );
            },
          })
          .start()
          .completed();
      });
    },
    TANSTACK_AI_DEPENDENCIES,
  );
});
