import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { Think } from '@cloudflare/think';
import * as Sentry from '@sentry/cloudflare';
import { routeAgentRequest } from 'agents';
import type { LanguageModel, ToolSet } from 'ai';
import { tool } from 'ai';
import DataLoader from 'dataloader';
import { z } from 'zod';

/**
 * Not wrapped by hand: `@sentry/cloudflare/vite` detects `extends Think` and rewrites this export
 * into `instrumentAgentWithSentry(...)` at build time. Wrapping it here would prove nothing about
 * the zero-config path.
 */
export class ThinkAgent extends Think<Env> {
  public getModel(): LanguageModel {
    // Call OpenRouter directly (rather than the default Vercel AI Gateway) so the e2e test needs
    // only a single OpenRouter key, reusing `E2E_OPENROUTER_API_KEY` like the other AI apps. A real
    // provider is also what makes the outgoing model request observable as an `http.client` span.
    const openrouter = createOpenRouter({ apiKey: this.env.E2E_OPENROUTER_API_KEY ?? '' });

    return openrouter('openai/gpt-4o-mini');
  }

  public getSystemPrompt(): string {
    return [
      'You are a concise assistant used by an automated end-to-end test.',
      'When the user asks about the weather in a place, call the `get_weather` tool for that place and answer in one short sentence using its result.',
      'When the user asks you to trigger a failure, call the `fail_now` tool.',
      'Do not ask follow-up questions.',
    ].join('\n');
  }

  public getTools(): ToolSet {
    return {
      get_weather: tool({
        description: 'Get the current weather for a location',
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }: { location: string }) => {
          // A manual span raised inside a tool must nest under that tool's `gen_ai.execute_tool`
          // span, which only holds if Think runs the tool inside the SDK's async context.
          return Sentry.startSpan({ name: 'lookup-forecast', op: 'gen_ai.tool.manual' }, async () => {
            // `dataloader` is instrumented through the orchestrion module transform rather than by
            // patching a global, so its spans are the probe for whether channel injection reached
            // this bundled worker at all.
            const loader = new DataLoader<string, string>(async keys => keys.map(key => `forecast:${key}`));
            await Promise.all([loader.load(location), loader.load(location)]);

            return { city: location, condition: 'Sunny', temperatureC: 22 };
          });
        },
      }),
      fail_now: tool({
        description: 'Always throws an error. Call this when the user asks to trigger a failure.',
        // A nominal argument rather than `z.object({})`, and an explicit return type: the AI SDK
        // infers `never` for an empty input schema, and a body that only throws infers
        // `Promise<never>`. Either one alone makes the `tool()` overload unresolvable.
        inputSchema: z.object({ reason: z.string() }),
        execute: async (_input: { reason: string }): Promise<string> => {
          throw new Error('Think tool failed on purpose');
        },
      }),
    };
  }

  public async onRequest(request: Request): Promise<Response> {
    const message = new URL(request.url).searchParams.get('message') ?? 'What is the weather in Paris?';

    const result = await this.runTurn({ input: message });

    return Response.json({ continuation: result.continuation });
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    return (await routeAgentRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
