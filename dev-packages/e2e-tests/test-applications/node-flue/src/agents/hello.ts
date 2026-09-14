'use agent';
import { useModel, useTool } from '@flue/runtime';
import * as Sentry from '@sentry/node';
import * as v from 'valibot';
import { itemLoader } from '../loaders.ts';

// The `'use agent'` directive is how `@flue/vite` finds this module and binds an identity to it at
// build time. That binding is the part a hand-written scenario cannot reproduce, so it is the main
// reason this app exists alongside the node-integration-test suite.
export function Hello() {
  useModel('openrouter/anthropic/claude-haiku-4.5');

  useTool({
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    input: v.object({ city: v.string() }),
    // Wrapped in a manual span: Flue runs the tool while the SDK's `execute_tool` span is active,
    // so this should nest directly under it rather than landing beside it.
    run: ({ city }) =>
      Sentry.startSpan(
        { name: 'resolve-weather', attributes: { 'weather.source': 'static-table', 'weather.city': city } },
        () => {
          return `It is 21 degrees and sunny in ${city}.`;
        },
      ),
  });

  // Called from inside a tool on purpose: the dataloader span then lands under `execute_tool` in
  // the agent's trace, which is what "captured alongside the AI spans" has to mean.
  useTool({
    name: 'count_items',
    description: 'Count items by loading them. Call this when the user asks to count items.',
    input: v.object({}),
    run: async () => {
      const doubled = await Promise.all([itemLoader.load(1), itemLoader.load(2), itemLoader.load(3)]);
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
