import * as Sentry from '@sentry/cloudflare';
import { routeAgentRequest, Agent, callable } from 'agents';

class MyBaseAgent extends Agent {
  @callable()
  async greet(name: string): Promise<string> {
    // User keys — instrumented, spans expected
    await this.ctx.storage.put('test', 'any value');
    await this.ctx.storage.get('test');

    // Framework-internal keys (agents/partyserver/MCP OAuth conventions) — filtered, no spans expected
    await this.ctx.storage.put('cf_e2e_internal', 'bookkeeping');
    await this.ctx.storage.get('__ps_name');
    await this.ctx.storage.get('/oauth/client/token');

    // Allowlisted cf_ key — span expected
    await this.ctx.storage.get('cf_user_key');

    return `Hello, ${name}!`;
  }
}

export const MyAgent = Sentry.instrumentAgentWithSentry(
  (env: Env) => ({
    traceLifecycle: 'static',
    dsn: env.E2E_TEST_DSN,
    tunnel: `http://localhost:3031/`,
    tracesSampleRate: 1,
    enableRpcTracePropagation: true,
    durableObjectStorageSpanAllowlist: ['cf_user_key'],
  }),
  MyBaseAgent,
);

export default Sentry.withSentry(
  (env: Env) => ({
    traceLifecycle: 'static',
    dsn: env.E2E_TEST_DSN,
    tunnel: `http://localhost:3031/`,
    tracesSampleRate: 1,
    enableRpcTracePropagation: true,
  }),
  {
    async fetch(request: Request, env: Env): Promise<Response> {
      const agentResponse = await routeAgentRequest(request, env);

      if (agentResponse) {
        return agentResponse;
      }

      return new Response(null, { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
