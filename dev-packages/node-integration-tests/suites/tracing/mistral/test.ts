import {
  GEN_AI_AGENT_NAME,
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmTests } from '../../../utils/runner';

const PROVIDER = 'mistralai';
const ORIGIN = 'auto.ai.mistralai';
// Not exported from `@sentry/conventions` yet; the SDK defines it in `ai/core/gen-ai-attributes`.
const GEN_AI_REQUEST_STREAM = 'gen_ai.request.stream';

// ESM-only: `@mistralai/mistralai` v2+ ships no CJS build, so CJS consumers load it via `require(esm)`,
// whose auto-instrumentation is inconsistent across Node versions. The SDK's native mode is ESM, so we
// only run the suite there.
describe('Mistral integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(__dirname, 'scenario-chat.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates chat spans with genAI recording disabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const chatSpan = container.items.find(s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123');
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.name).toBe('chat mistral-small-latest');
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('chat');
            expect(chatSpan!.attributes[SENTRY_OP]?.value).toBe('gen_ai.chat');
            expect(chatSpan!.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(chatSpan!.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe(PROVIDER);
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('mistral-small-latest');
            expect(chatSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE]?.value).toBe(0.7);
            expect(chatSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS]?.value).toBe(100);
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_MODEL]?.value).toBe('mistral-small-latest');
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["stop"]');
            expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
            expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(15);
            expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(25);
            // recording disabled → no prompt/response content
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeUndefined();

            const streamSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-123',
            );
            expect(streamSpan).toBeDefined();
            expect(streamSpan!.name).toBe('chat mistral-large-latest');
            expect(streamSpan!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('chat');
            expect(streamSpan!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
            expect(streamSpan!.attributes[GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK]?.value).toEqual(expect.any(Number));
            expect(streamSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(30);

            // `chat.stream()` takes no `stream` request field, so the flag has to come from the method.
            expect(streamSpan!.attributes[GEN_AI_REQUEST_STREAM]?.value).toBe(true);
            expect(chatSpan!.attributes[GEN_AI_REQUEST_STREAM]?.value).toBe(false);

            const errorSpan = container.items.find(s => s.attributes[GEN_AI_REQUEST_MODEL]?.value === 'error-model');
            expect(errorSpan).toBeDefined();
            // `bindTracingChannelToSpan` derives the status message from the thrown error.
            expect(errorSpan!.status).toBe('error');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-chat.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records chat inputs and outputs with PII enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const chatSpan = container.items.find(s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123');
            expect(chatSpan).toBeDefined();
            // The system message is split out into gen_ai.system_instructions.
            expect(chatSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]?.value).toContain('You are a helpful assistant.');
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES]?.value).toBe(
              '[{"role":"user","content":"What is the capital of France?"}]',
            );
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('["Hello from Mistral mock!"]');
            expect(chatSpan!.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toBe(
              '[{"role":"assistant","parts":[{"type":"text","content":"Hello from Mistral mock!"}],"finish_reason":"stop"}]',
            );
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-chat.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('records chat inputs and outputs with explicit integration options', async () => {
      await createRunner()
        .expect({
          span: container => {
            const chatSpan = container.items.find(s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123');
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES]?.value).toContain('What is the capital of France?');
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('["Hello from Mistral mock!"]');
            expect(chatSpan!.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toBe(
              '[{"role":"assistant","parts":[{"type":"text","content":"Hello from Mistral mock!"}],"finish_reason":"stop"}]',
            );
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates embeddings spans', async () => {
      await createRunner()
        .expect({
          span: container => {
            const embeddingsSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'embd-mock123',
            );
            expect(embeddingsSpan).toBeDefined();
            expect(embeddingsSpan!.name).toBe('embeddings mistral-embed');
            expect(embeddingsSpan!.status).toBe('ok');
            expect(embeddingsSpan!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('embeddings');
            expect(embeddingsSpan!.attributes[SENTRY_OP]?.value).toBe('gen_ai.embeddings');
            expect(embeddingsSpan!.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(embeddingsSpan!.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe(PROVIDER);
            expect(embeddingsSpan!.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('mistral-embed');
            expect(embeddingsSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(8);
            expect(embeddingsSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(8);
            expect(embeddingsSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT]).toBeUndefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records embeddings input with PII enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const embeddingsSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'embd-mock123',
            );
            expect(embeddingsSpan).toBeDefined();
            expect(embeddingsSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value).toContain('Embedding test!');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-agents.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates invoke_agent spans', async () => {
      await createRunner()
        .expect({
          span: container => {
            const agentSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'agentcmpl-mock123',
            );
            expect(agentSpan).toBeDefined();
            expect(agentSpan!.name).toBe('invoke_agent');
            expect(agentSpan!.status).toBe('ok');
            expect(agentSpan!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('invoke_agent');
            expect(agentSpan!.attributes[SENTRY_OP]?.value).toBe('gen_ai.invoke_agent');
            expect(agentSpan!.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(agentSpan!.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe(PROVIDER);
            expect(agentSpan!.attributes[GEN_AI_AGENT_NAME]?.value).toBe('ag-mock-123');
            expect(agentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
            expect(agentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(25);

            const agentStreamSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'agentcmpl-stream-123',
            );
            expect(agentStreamSpan).toBeDefined();
            expect(agentStreamSpan!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-agents.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records agent inputs and outputs with PII enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const agentSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'agentcmpl-mock123',
            );
            expect(agentSpan).toBeDefined();
            expect(agentSpan!.attributes[GEN_AI_INPUT_MESSAGES]?.value).toContain('Who is the best French painter?');
            expect(agentSpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('["Hello from Mistral agent!"]');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-tools.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records tool definitions and tool calls (streaming + non-streaming)', async () => {
      await createRunner()
        .expect({
          span: container => {
            const toolSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-tools-123',
            );
            expect(toolSpan).toBeDefined();
            expect(toolSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]?.value).toContain('get_weather');
            expect(toolSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]?.value).toContain('get_weather');
            expect(toolSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["tool_calls"]');

            const streamSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-tools-stream-123',
            );
            expect(streamSpan).toBeDefined();
            expect(streamSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]?.value).toContain('get_weather');
            // The fragmented argument string ('{"city":' + '"Paris"}') is accumulated across chunks —
            // both fragments present proves the join (quotes are backslash-escaped in the JSON string).
            const streamedToolCalls = streamSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]?.value;
            expect(streamedToolCalls).toContain('get_weather');
            expect(streamedToolCalls).toContain('city');
            expect(streamedToolCalls).toContain('Paris');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-manual.mjs', 'instrument-manual.mjs', (createRunner, test) => {
    test('instruments a client wrapped with instrumentMistralAiClient', async () => {
      await createRunner()
        .expect({
          span: container => {
            const chatSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-manual-123',
            );
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.name).toBe('chat mistral-small-latest');
            expect(chatSpan!.status).toBe('ok');
            expect(chatSpan!.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(chatSpan!.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe(PROVIDER);
            expect(chatSpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('["Hello from the manual client!"]');

            // The scenario drains the stream with `getReader()`, which only works if the instrumented
            // result is still the SDK's `EventStream` and only ends the span if the reader is wrapped.
            const streamSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-manual-stream-123',
            );
            expect(streamSpan).toBeDefined();
            expect(streamSpan!.name).toBe('chat mistral-large-latest');
            expect(streamSpan!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
            expect(streamSpan!.attributes[GEN_AI_REQUEST_STREAM]?.value).toBe(true);
            expect(streamSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(12);
            expect(streamSpan!.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('Manual streaming!');
          },
        })
        .start()
        .completed();
    });
  });
  createEsmTests(__dirname, 'scenario-parse.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates chat spans for the structured-output entry points', async () => {
      await createRunner()
        .expect({
          span: container => {
            // `parse` bypasses `chat.complete`, so this span can only come from its own
            // orchestrion entry — and there must be exactly one, not one per underlying call.
            const parseSpans = container.items.filter(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-parse-123',
            );
            expect(parseSpans).toHaveLength(1);
            expect(parseSpans[0]!.name).toBe('chat mistral-small-latest');
            expect(parseSpans[0]!.status).toBe('ok');
            expect(parseSpans[0]!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('chat');
            expect(parseSpans[0]!.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            expect(parseSpans[0]!.attributes[GEN_AI_REQUEST_STREAM]?.value).toBe(false);
            expect(parseSpans[0]!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(12);

            const parseStreamSpan = container.items.find(
              s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-parse-stream-123',
            );
            expect(parseStreamSpan).toBeDefined();
            expect(parseStreamSpan!.attributes[GEN_AI_REQUEST_STREAM]?.value).toBe(true);
            expect(parseStreamSpan!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-abort.mjs', 'instrument.mjs', (createRunner, test) => {
    test('ends a call the caller aborts as cancelled, but an SDK timeout as an error', async () => {
      await createRunner()
        .unordered()
        .expect({
          span: container => {
            const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === ORIGIN);
            expect(spans).toHaveLength(4);
            const statusByModel = Object.fromEntries(
              spans.map(span => [span.attributes[GEN_AI_REQUEST_MODEL]?.value, span.status]),
            );
            // Span streaming sends `cancelled` as `ok`.
            expect(statusByModel).toEqual({
              'abort-before-stream': 'ok',
              'abort-non-streaming': 'ok',
              'timeout-before-stream': 'error',
              'timeout-non-streaming': 'error',
            });
          },
        })
        .start()
        .completed();
    });
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
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === ORIGIN);
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

  createEsmTests(
    __dirname,
    'scenario-recording-functions.mjs',
    'instrument-with-span-hooks.mjs',
    (createRunner, test) => {
      test('runs the span hooks at start in the caller context and at end with the response', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === ORIGIN);
              const hooksByKey = Object.fromEntries(
                spans.map(span => [
                  span.attributes[GEN_AI_RESPONSE_ID]?.value,
                  [span.attributes['test.start']?.value, span.attributes['test.end']?.value],
                ]),
              );
              expect(hooksByKey).toEqual({
                'cmpl-mistral-public': ['mistral-public:public', 'cmpl-mistral-public'],
                'cmpl-mistral-private': ['mistral-private:private', 'cmpl-mistral-private'],
                // A stream has no single response object, and its tag changes only after the call started.
                'cmpl-mistral-public-stream': ['mistral-public-stream:private', 'no response'],
              });
            },
          })
          .start()
          .completed();
      });
    },
  );
});
