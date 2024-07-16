/**
 * @type {import('@cloudflare/workers-types').ExportedHandler}
 */
export default {
  async fetch(_request, _env, _ctx) {
    return new Response('Hello Sentry!');
  },
};
