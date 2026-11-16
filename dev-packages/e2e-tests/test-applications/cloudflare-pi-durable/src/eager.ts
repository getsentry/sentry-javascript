import { createModels } from '@earendil-works/pi-ai/models';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { createRegistry, Harness, ProviderDoc } from '@earendil-works/pi-durable';
import * as Sentry from '@sentry/cloudflare';
import { openPiSessionStore } from 'agents/harness/pi';
import { DurableObject } from 'cloudflare:workers';

// chord's `BACKGROUND_CONTEXT`, which pi-durable does not re-export.
const BACKGROUND_CONTEXT = Object.freeze({
  abortSignal: undefined,
  value: () => undefined,
  toString: () => '[Context background]',
}) as unknown as Parameters<typeof Harness.open>[2];

/**
 * A plain Durable Object that opens pi-durable's Harness in its constructor, before any of its
 * handlers runs.
 */
class EagerAssistantBase extends DurableObject<Env> {
  private harness!: Harness;

  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const models = createModels({
        authContext: {
          env: async name => (name === 'OPENROUTER_API_KEY' ? env.E2E_OPENROUTER_API_KEY : undefined),
          fileExists: async () => false,
        },
      });
      models.setProvider(openrouterProvider());
      const storage = await openPiSessionStore(ctx.storage);
      this.harness = await Harness.open(storage, { models, registry: createRegistry() }, BACKGROUND_CONTEXT);
      this.harness.resume();
    });
  }

  public async fetch(request: Request): Promise<Response> {
    const conversationId = Number(new URL(request.url).searchParams.get('conversation')) as Parameters<
      Harness['conversation']
    >[0];
    if (!conversationId) {
      const conversation = await this.harness.createConversation(
        {
          ownership: { kind: 'ownerless' },
          agent: { model: { provider: 'openrouter', modelId: 'anthropic/claude-haiku-4.5' } },
        },
        BACKGROUND_CONTEXT,
      );
      // The SDK reports the provider session id as `gen_ai.conversation.id`.
      const provider = await this.harness.snapshot(ProviderDoc, conversation.id, BACKGROUND_CONTEXT);
      return Response.json({ id: conversation.id, sessionId: provider?.sessionId });
    }

    const { message } = await request.json<{ message: string }>();
    const conversation = await this.harness.conversation(conversationId, BACKGROUND_CONTEXT);
    const submission = await conversation!.submit({ type: 'input', content: message }, BACKGROUND_CONTEXT);
    const settled = await submission.wait(BACKGROUND_CONTEXT);
    return Response.json(settled);
  }
}

export const EagerAssistant = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa',
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1.0,
  }),
  EagerAssistantBase,
);

export default {
  fetch: () => new Response('Not found', { status: 404 }),
} satisfies ExportedHandler<Env>;
