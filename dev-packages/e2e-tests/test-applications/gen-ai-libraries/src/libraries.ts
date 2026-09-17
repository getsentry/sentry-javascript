// Each gen-AI *library* (not framework) we instrument, exercised against a real model through
// OpenRouter — the single `E2E_OPENROUTER_API_KEY` the other AI e2e apps already use. Every entry runs
// a plain chat query and a forced tool call, so the same two assertions apply to all of them. These
// handlers are framework- and runtime-agnostic: `entry.node.ts` (express) and `entry.cloudflare.ts`
// (workerd) both call them, passing the key from their respective environments.
//
// OpenRouter serves an OpenAI-compatible `/api/v1/chat/completions` and an Anthropic-compatible
// `/api/v1/messages` ("Anthropic skin"), which is why the OpenAI, Together, Mistral, Anthropic and
// Vercel AI SDKs can all point at it. Every request uses the same `openai/gpt-4o-mini` model — the
// model is incidental; what is under test is each SDK's own request/response code path, the thing
// Sentry instruments.
//
// Two libraries we instrument are intentionally absent because they cannot reach OpenRouter:
//   - Google GenAI (`@google/genai`) speaks the native Gemini `generateContent` format, which
//     OpenRouter does not serve.
//   - Groq (`groq-sdk`) hardcodes a `/openai/v1/...` request path that OpenRouter (served under
//     `/api/v1`) does not expose. Its instrumentation is the shared OpenAI-compatible code path that
//     Together exercises here, and it is covered by the node-integration-tests.
import Anthropic from '@anthropic-ai/sdk';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { Mistral } from '@mistralai/mistralai';
import OpenAI from 'openai';
import Together from 'together-ai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const OPENROUTER_V1 = 'https://openrouter.ai/api/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api';
const MODEL = 'openai/gpt-4o-mini';

const SHORT_ANSWER = 'Answer in at most five words.';
const CHAT_PROMPT = `What is the capital of France? ${SHORT_ANSWER}`;
const WEATHER_PROMPT = `Use the get_weather tool to check the weather in Paris. ${SHORT_ANSWER}`;
const SYSTEM = 'You are a helpful assistant used by an automated test.';

// OpenAI-style function tool, shared by the OpenAI-compatible SDKs.
const OPENAI_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: 'The city name' } },
      required: ['city'],
    },
  },
};

export interface Library {
  id: string;
  /** The op of the model-call span; asserted by the tests. */
  op: 'gen_ai.chat' | 'gen_ai.generate_content';
  /** `gen_ai.provider.name` for the direct-SDK libraries; unset for the Vercel AI SDK. */
  provider?: string;
  /** `sentry.origin` for the direct-SDK libraries; unset for the Vercel AI SDK. */
  origin?: string;
  chat: (apiKey: string) => Promise<unknown>;
  tools: (apiKey: string) => Promise<unknown>;
}

/** Chat + forced tool call for an OpenAI-compatible chat-completions client (OpenAI, Together). */
function openAiCompatible(
  id: string,
  provider: string,
  origin: string,
  makeClient: (apiKey: string) => { chat: { completions: { create: (body: unknown) => Promise<any> } } },
): Library {
  return {
    id,
    op: 'gen_ai.chat',
    provider,
    origin,
    chat: async apiKey => {
      const completion = await makeClient(apiKey).chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: CHAT_PROMPT },
        ],
        temperature: 0,
        max_tokens: 32,
      });
      return completion.choices?.[0]?.message?.content ?? '';
    },
    tools: async apiKey => {
      const completion = await makeClient(apiKey).chat.completions.create({
        model: MODEL,
        messages: [{ role: 'user', content: WEATHER_PROMPT }],
        tools: [OPENAI_TOOL],
        tool_choice: 'required',
        max_tokens: 64,
      });
      return completion.choices?.[0]?.message?.tool_calls ?? [];
    },
  };
}

export const libraries: Library[] = [
  openAiCompatible('openai', 'openai', 'auto.ai.openai', apiKey => new OpenAI({ apiKey, baseURL: OPENROUTER_V1 })),
  openAiCompatible(
    'together',
    'together_ai',
    'auto.ai.together_ai',
    apiKey => new Together({ apiKey, baseURL: OPENROUTER_V1 }) as any,
  ),

  {
    id: 'mistral',
    op: 'gen_ai.chat',
    provider: 'mistralai',
    origin: 'auto.ai.mistralai',
    chat: async apiKey => {
      const client = new Mistral({ apiKey, serverURL: OPENROUTER_BASE });
      const completion = await client.chat.complete({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: CHAT_PROMPT },
        ],
        temperature: 0,
        maxTokens: 32,
      });
      return completion.choices?.[0]?.message?.content ?? '';
    },
    tools: async apiKey => {
      const client = new Mistral({ apiKey, serverURL: OPENROUTER_BASE });
      const completion = await client.chat.complete({
        model: MODEL,
        messages: [{ role: 'user', content: WEATHER_PROMPT }],
        tools: [OPENAI_TOOL] as any,
        // OpenRouter's OpenAI-compatible endpoint only accepts none/auto/required, not Mistral's `any`.
        toolChoice: 'required',
        maxTokens: 64,
      });
      return completion.choices?.[0]?.message?.toolCalls ?? [];
    },
  },

  {
    id: 'anthropic',
    op: 'gen_ai.chat',
    provider: 'anthropic',
    origin: 'auto.ai.anthropic',
    chat: async apiKey => {
      // OpenRouter's Anthropic skin authenticates with a bearer token, so the key goes in `authToken`
      // (Authorization: Bearer) rather than `apiKey` (x-api-key).
      const client = new Anthropic({ authToken: apiKey, baseURL: OPENROUTER_BASE });
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 32,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: CHAT_PROMPT }],
      });
      const first = message.content?.[0];
      return first && first.type === 'text' ? first.text : '';
    },
    tools: async apiKey => {
      const client = new Anthropic({ authToken: apiKey, baseURL: OPENROUTER_BASE });
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 64,
        messages: [{ role: 'user', content: WEATHER_PROMPT }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get the current weather for a city.',
            input_schema: {
              type: 'object',
              properties: { city: { type: 'string', description: 'The city name' } },
              required: ['city'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'get_weather' },
      });
      return (message.content ?? []).filter(block => block.type === 'tool_use');
    },
  },

  {
    id: 'vercel-ai',
    // The Vercel AI SDK emits `gen_ai.generate_content` (nested in a `gen_ai.invoke_agent` span),
    // reports the provider from the model id, and uses its own span origin.
    op: 'gen_ai.generate_content',
    chat: async apiKey => {
      const openrouter = createOpenRouter({ apiKey });
      const { text } = await generateText({
        model: openrouter(MODEL),
        system: SYSTEM,
        prompt: CHAT_PROMPT,
        temperature: 0,
        experimental_telemetry: { isEnabled: true },
      });
      return text;
    },
    tools: async apiKey => {
      const openrouter = createOpenRouter({ apiKey });
      const result = await generateText({
        model: openrouter(MODEL),
        prompt: WEATHER_PROMPT,
        toolChoice: 'required',
        experimental_telemetry: { isEnabled: true },
        tools: {
          get_weather: tool({
            description: 'Get the current weather for a city.',
            inputSchema: z.object({ city: z.string().describe('The city name') }),
            execute: async ({ city }) => `It is sunny in ${city}.`,
          }),
        },
      });
      return result.toolCalls ?? [];
    },
  },
];
