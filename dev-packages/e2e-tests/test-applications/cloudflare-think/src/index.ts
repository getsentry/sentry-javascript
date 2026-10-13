import { routeAgentRequest } from 'agents';

// Re-exported rather than declared here so the build-time wrapper has to cross a module boundary
// to find and wrap the class. See the note on the class itself.
export { ThinkAgent } from './think-agent';

export default {
  async fetch(request, env): Promise<Response> {
    return (await routeAgentRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
