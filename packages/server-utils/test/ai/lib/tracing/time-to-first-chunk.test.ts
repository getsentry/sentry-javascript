import { GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { getMainCarrier, setCurrentClient, spanToJSON, startInactiveSpan } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instrumentAsyncIterableStream } from '../../../../src/ai/anthropic-ai/streaming';
import type { AnthropicAiStreamingEvent } from '../../../../src/ai/anthropic-ai/types';
import { instrumentStream as instrumentGoogleGenAIStream } from '../../../../src/ai/google-genai/streaming';
import type { GoogleGenAIResponse } from '../../../../src/ai/google-genai/types';
import { createLangChainCallbackHandler } from '../../../../src/ai/langchain';
import { SentryMastraExporter } from '../../../../src/ai/mastra';
import { instrumentEventStream as instrumentMistralStream } from '../../../../src/ai/mistral/streaming';
import { instrumentStream as instrumentOpenAIStream } from '../../../../src/ai/openai/streaming';
import { instrumentWorkersAiStream } from '../../../../src/ai/workers-ai/streaming';
import { tapModelCallStream } from '../../../../src/integrations/vercel-ai/util';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

const DELAY_MS = 50;

const wait = (): Promise<void> => new Promise(resolve => setTimeout(resolve, DELAY_MS));

// Yields the chunks that carry no output, waits, then yields the output chunks.
async function* delayedChunks<T>(before: T[], after: T[]): AsyncGenerator<T> {
  yield* before;
  await wait();
  yield* after;
}

function toReadableStream<T>(chunks: AsyncIterable<T>): ReadableStream<T> {
  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream<T>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

async function drain(stream: AsyncIterable<unknown> | ReadableStream<unknown>): Promise<void> {
  if (stream instanceof ReadableStream) {
    const reader = stream.getReader();
    while (!(await reader.read()).done) {
      // drain
    }
    return;
  }
  for await (const _ of stream) {
    // drain
  }
}

function timeToFirstChunk(span: Span): unknown {
  return spanToJSON(span).attributes?.[GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK];
}

describe('gen_ai.response.time_to_first_chunk', () => {
  let endedSpans: Span[];

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  const streams: Array<[string, (span: Span) => AsyncIterable<unknown> | ReadableStream<unknown>]> = [
    [
      'OpenAI chat completions',
      span => {
        const chunk = (delta: Record<string, unknown>): unknown => ({
          id: 'chatcmpl-1',
          object: 'chat.completion.chunk',
          model: 'gpt-4o',
          choices: [{ index: 0, delta }],
        });
        return instrumentOpenAIStream(
          delayedChunks([chunk({ role: 'assistant', content: '' })], [chunk({ content: 'Hi' })]),
          span,
          false,
        );
      },
    ],
    [
      'OpenAI responses',
      span =>
        instrumentOpenAIStream(
          delayedChunks(
            [
              { type: 'response.created', response: { id: 'resp_1', model: 'gpt-4o' } },
              { type: 'response.output_text.delta', delta: '' },
            ],
            [{ type: 'response.output_item.added', item: { type: 'function_call', name: 'get_weather' } }],
          ),
          span,
          false,
        ),
    ],
    [
      'Anthropic',
      span =>
        instrumentAsyncIterableStream(
          delayedChunks<AnthropicAiStreamingEvent>(
            [
              { type: 'message_start', message: { id: 'msg_1', model: 'claude' } } as AnthropicAiStreamingEvent,
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            ],
            [{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } }],
          ),
          span,
          false,
        ),
    ],
    [
      'Google GenAI',
      span =>
        instrumentGoogleGenAIStream(
          delayedChunks<GoogleGenAIResponse>(
            [{ candidates: [{ content: { parts: [{ thoughtSignature: 'sig' }] } }] } as GoogleGenAIResponse],
            [{ candidates: [{ content: { parts: [{ text: 'Hi' }] } }] } as GoogleGenAIResponse],
          ),
          span,
          false,
        ),
    ],
    [
      'Mistral',
      span => {
        const stream = delayedChunks(
          [
            {
              data: {
                id: 'cmpl-1',
                model: 'mistral',
                choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
              },
            },
          ],
          [{ data: { choices: [{ index: 0, delta: { content: 'Hi' } }] } }],
        );
        instrumentMistralStream(stream, span, false);
        return stream;
      },
    ],
    [
      'Workers AI',
      span => {
        const encoder = new TextEncoder();
        return instrumentWorkersAiStream(
          toReadableStream(
            delayedChunks(
              [encoder.encode('data: {"response":""}\n\n')],
              [encoder.encode('data: {"response":"Hi"}\n\ndata: [DONE]\n\n')],
            ),
          ),
          span,
          false,
        );
      },
    ],
    [
      'Vercel AI',
      span =>
        tapModelCallStream(
          span,
          toReadableStream(
            delayedChunks<unknown>(
              [
                { type: 'response-metadata', id: 'resp_1', modelId: 'gpt-4o' },
                { type: 'text-start', id: '0' },
              ],
              [{ type: 'text-delta', id: '0', delta: 'Hi' }],
            ),
          ),
          () => span.end(),
          () => span.end(),
        ),
    ],
  ];

  it.each(streams)('records the time to the first output chunk of a %s stream', async (_name, instrument) => {
    const span = startInactiveSpan({ name: 'chat' });

    await drain(instrument(span));
    span.end();

    expect(timeToFirstChunk(span)).toBeGreaterThanOrEqual((DELAY_MS - 10) / 1000);
  });

  it('records the time to the first LangChain token or tool call chunk', async () => {
    const handler = createLangChainCallbackHandler();
    handler.handleChatModelStart?.({ id: ['langchain', 'chat_models', 'ChatOpenAI'] }, [[]], 'run-1');
    handler.handleLLMNewToken?.('', undefined, 'run-1');
    await wait();
    handler.handleLLMNewToken?.('', undefined, 'run-1', undefined, undefined, {
      chunk: { message: { tool_call_chunks: [{ name: 'get_weather' }] } },
    });
    handler.handleLLMEnd?.({ generations: [] }, 'run-1');

    expect(timeToFirstChunk(endedSpans[0]!)).toBeGreaterThanOrEqual((DELAY_MS - 10) / 1000);
  });

  it('maps the completion start time of a Mastra model generation', async () => {
    const exportedSpan = {
      id: 'span-1',
      name: 'llm',
      type: 'model_generation' as const,
      startTime: new Date('2026-01-01T00:00:00Z'),
      endTime: new Date('2026-01-01T00:00:02Z'),
      attributes: { model: 'gpt-4o', streaming: true, completionStartTime: new Date('2026-01-01T00:00:01.5Z') },
    };
    const exporter = new SentryMastraExporter();
    await exporter.exportTracingEvent({ type: 'span_started', exportedSpan });
    await exporter.exportTracingEvent({ type: 'span_ended', exportedSpan });

    expect(timeToFirstChunk(endedSpans[0]!)).toBe(1.5);
  });
});
