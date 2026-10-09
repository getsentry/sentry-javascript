import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { createRegistry, defineExtension, defineTool, Harness, section } from '@earendil-works/pi-durable';
import * as Sentry from '@sentry/cloudflare';
import { Agent } from 'agents';
import { PiHarness } from 'agents/harness/pi';

/**
 * pi-durable hosted by the Agents SDK `PiHarness`: pi keeps its state in this object's SQLite
 * database, and the harness reopens pi when the object restarts. Nothing wires Sentry into
 * pi-durable by hand, the Vite plugin injects the channel into `Harness.open()`.
 */
export class Assistant extends Agent<Env> {
  public registry = createRegistry();

  public harness = new PiHarness({
    harness: ({ storage, context }) => {
      // pi-ai reads provider keys from `process.env` by default, so the Worker hands over its secret.
      const models = createModels({
        authContext: {
          env: async name => (name === 'OPENROUTER_API_KEY' ? this.env.E2E_OPENROUTER_API_KEY : undefined),
          fileExists: async () => false,
        },
      });
      models.setProvider(openrouterProvider());
      return Harness.open(storage, { models, registry: this.registry }, context);
    },
    defaults: { model: { provider: 'openrouter', id: 'anthropic/claude-haiku-4.5' } },
  });

  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.registry.install(
      defineExtension({
        name: 'e2e',
        sections: [
          section('preamble', () => 'You are a test assistant. Use the tools exactly as asked. Keep answers short.', {
            tag: false,
          }),
        ],
        tools: [
          defineTool({
            name: 'get_weather',
            description: 'Get the current weather for a city.',
            parameters: Type.Object({ city: Type.String() }),
            // The manual span should nest under the SDK's `execute_tool` span.
            execute: async args =>
              Sentry.startSpan({ name: 'resolve-weather', attributes: { 'weather.city': args.city } }, () => ({
                content: [{ type: 'text', text: `It is 21 degrees and sunny in ${args.city}.` }],
              })),
          }),
          defineTool({
            name: 'fail_now',
            description: 'Always throws an error. Call this when the user asks to trigger a failure.',
            parameters: Type.Object({}),
            execute: async () => {
              throw new Error('Intentional pi-durable tool failure');
            },
          }),
          defineTool({
            name: 'crash_once',
            description: 'Runs one step of a job. Call this when the user asks for crash_once.',
            parameters: Type.Object({ job: Type.String() }),
            // Replay-safe, so pi-durable reruns the call after the reset instead of failing it.
            replay: 'safe',
            execute: async args => {
              const marker = `crashed:${args.job}`;
              if (await this.ctx.storage.get(marker)) {
                return { content: [{ type: 'text', text: `Step of job ${args.job} completed.` }] };
              }
              await this.ctx.storage.put(marker, true);
              await this.ctx.storage.sync();
              // Drops the object mid-call, like an eviction. The next request starts it again.
              this.ctx.abort('crash_once resets the Durable Object');
              throw new Error('The Durable Object did not reset');
            },
          }),
        ],
      }),
    );
    this.lifecycle.use(this.harness);
  }

  public async onRequest(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      const operationId = new URL(request.url).searchParams.get('operation') ?? '';
      const { status, reason, text } = await this.harness.wait(operationId);
      return Response.json({ status, reason, text });
    }

    const { message, operationId } = await request.json<{ message: string; operationId?: string }>();
    const { status, reason, text } = await this.harness.prompt(message, { operationId });
    return Response.json({ status, reason, text });
  }
}
