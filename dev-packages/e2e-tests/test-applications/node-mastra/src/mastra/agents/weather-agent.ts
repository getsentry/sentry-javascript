import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { countItemsTool } from '../tools/count-items.js';
import { failNowTool } from '../tools/fail-now.js';
import { getWeatherTool } from '../tools/get-weather.js';

const apiKey = process.env.E2E_OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('E2E_OPENROUTER_API_KEY is not set');
}

// Call OpenRouter directly (rather than the default Vercel AI Gateway) so the
// e2e test needs only a single OpenRouter key, reusing `E2E_OPENROUTER_API_KEY`.
const openrouter = createOpenRouter({ apiKey });

// An in-memory libsql store is enough for the test: Mastra requires a storage
// provider before `generate(..., { memory: { thread, resource } })` is accepted,
// and that thread id is what the Sentry exporter maps to `gen_ai.conversation.id`.
const memory = new Memory({
  storage: new LibSQLStore({ id: 'libsql-storage', url: ':memory:' }),
});

export const WEATHER_AGENT = 'weatherAgent';

export const weatherAgent = new Agent({
  // `id` (registry key + REST `:agentId`), `name` (used for `gen_ai.agent.name`)
  // are kept identical so the generate endpoint and span assertions line up.
  id: WEATHER_AGENT,
  name: WEATHER_AGENT,
  instructions: [
    'You are a concise assistant used by an automated end-to-end test.',
    'When the user asks about the weather in a place, call the `get_weather` tool for that place and answer in one short sentence using its result.',
    'When the user asks you to trigger a failure, call the `fail_now` tool.',
    'When the user asks you to count items, call the `count_items` tool with the item names.',
    'Do not ask follow-up questions.',
  ].join('\n'),
  model: openrouter('openai/gpt-4o-mini'),
  tools: { get_weather: getWeatherTool, fail_now: failNowTool, count_items: countItemsTool },
  memory,
});
