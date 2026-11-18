import * as Sentry from '@sentry/node';
import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const usage = {
  input_tokens: 10,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 20,
  output_tokens_details: { reasoning_tokens: 0 },
};

const toolCallResponse = [
  {
    type: 'response.created',
    response: { id: 'resp_1', created_at: 1700000000, model: 'gpt-test', service_tier: null },
  },
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'getWeather', arguments: '' },
  },
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'getWeather',
      arguments: JSON.stringify({ location: 'San Francisco' }),
      status: 'completed',
    },
  },
  { type: 'response.completed', response: { incomplete_details: null, service_tier: null, usage } },
];

const textResponse = [
  {
    type: 'response.created',
    response: { id: 'resp_2', created_at: 1700000000, model: 'gpt-test', service_tier: null },
  },
  { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1' } },
  { type: 'response.output_text.delta', item_id: 'msg_1', delta: 'Sunny, 72°F.', logprobs: [] },
  { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } },
  { type: 'response.completed', response: { incomplete_details: null, service_tier: null, usage } },
];

let callCount = 0;

// A real provider instead of MockLanguageModelV3: @ai-sdk/openai attaches a telemetry redactor to the
// request body when tools are sent, which makes `ai` publish a redacted copy of the model call result.
const openai = createOpenAI({
  apiKey: 'test',
  fetch: async () => {
    const events = callCount++ === 0 ? toolCallResponse : textResponse;
    return new Response(`${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    });
  },
});

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const result = streamText({
      model: openai.responses('gpt-test'),
      tools: {
        getWeather: tool({
          description: 'Get the current weather for a location',
          inputSchema: z.object({ location: z.string() }),
          execute: async ({ location }) => `Weather in ${location}: Sunny, 72°F`,
        }),
      },
      stopWhen: stepCountIs(5),
      prompt: 'What is the weather in San Francisco?',
    });

    Sentry.captureMessage(`streamText returned: ${await result.text}`);
  });
}

run();
