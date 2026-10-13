import { streamText } from 'ai';

// The worker imports an orchestrion-instrumented module (`ai`), so the server
// bundle is expected to contain `diagnostics_channel` injections.
export default {
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/worker') {
      return new Response(`streamText: ${typeof streamText}`);
    }
    return new Response('not found', { status: 404 });
  },
};
