import { routeAgentRequest } from 'agents';

export { Assistant } from './assistant';

export default {
  async fetch(request, env): Promise<Response> {
    return (await routeAgentRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
