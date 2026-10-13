import { streamText } from 'ai';

export default {
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/worker') {
      return new Response(`streamText: ${typeof streamText}`);
    }
    return new Response('not found', { status: 404 });
  },
};
