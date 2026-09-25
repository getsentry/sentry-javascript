'use agent';
import { useModel, useTool } from '@flue/runtime';
import * as Sentry from '@sentry/cloudflare';
import * as v from 'valibot';
import { createItemLoader } from '../loaders.ts';

// Flue applies the agent's Durable Object wrapper from this re-export.
export { cloudflare } from '../sentry.ts';

// The `'use agent'` directive is how `@flue/vite` binds an identity to this module at build time.
export function Hello() {
  useModel('openrouter/anthropic/claude-haiku-4.5');

  useTool({
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    input: v.object({ city: v.string() }),
    // Wrapped in a manual span: Flue runs the tool while the SDK's `execute_tool` span is active,
    // so this should nest directly under it rather than landing beside it.
    run: ({ city }) =>
      Sentry.startSpan({ name: 'resolve-weather', attributes: { 'weather.source': 'static-table' } }, () => {
        return `It is 21 degrees and sunny in ${city}.`;
      }),
  });

  // Called from inside a tool so the dataloader span lands in the agent's trace beside the AI
  // spans. Constructed per execution: a module-level loader caches its keys, so a second call
  // would skip the batch function and emit no span.
  useTool({
    name: 'count_items',
    description: 'Count items by loading them. Call this when the user asks to count items.',
    input: v.object({}),
    run: async () => {
      const loader = createItemLoader();
      const doubled = await Promise.all([loader.load(1), loader.load(2), loader.load(3)]);
      return `Loaded ${doubled.length} items: ${doubled.join(', ')}.`;
    },
  });

  useTool({
    name: 'fail_now',
    description: 'Always throws an error. Call this when the user asks to trigger a failure.',
    input: v.object({}),
    run: () => {
      throw new Error('Intentional flue tool failure');
    },
  });

  return 'You are a helpful assistant. Use get_weather when asked about weather, count_items when asked to count items, and fail_now when asked to fail.';
}
