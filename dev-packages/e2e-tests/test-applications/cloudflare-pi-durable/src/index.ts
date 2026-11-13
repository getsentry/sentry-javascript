import { routeAgentRequest } from 'agents';

export { Assistant } from './assistant';

export default {
  async fetch(request, env): Promise<Response> {
    const eager = new URL(request.url).pathname.match(/^\/eager\/([^/]+)$/);
    if (eager) {
      return env.EagerAssistant.get(env.EagerAssistant.idFromName(eager[1]!)).fetch(request);
    }
    return (await routeAgentRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
