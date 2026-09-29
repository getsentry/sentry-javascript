'use agent';
import { useModel, useTool } from '@flue/runtime';
import * as v from 'valibot';

// Flue applies the agent's Durable Object wrapper from this re-export.
export { cloudflare } from '../sentry.ts';

export function Hello() {
  useModel('openrouter/anthropic/claude-haiku-4.5');

  useTool({
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    input: v.object({ city: v.string() }),
    run: ({ data }) => `It is 21 degrees and sunny in ${data.city}.`,
  });

  useTool({
    name: 'fail_now',
    description: 'Always throws an error. Call this when the user asks to trigger a failure.',
    input: v.object({}),
    run: () => {
      throw new Error('Intentional flue tool failure');
    },
  });

  return 'You are a helpful assistant. Use get_weather when asked about weather, and fail_now when asked to fail.';
}
