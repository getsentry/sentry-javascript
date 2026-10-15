// Shaped like bundler output (e.g. `@astrojs/cloudflare`): the default export
// is a specifier, not `export default <expr>`.
var fetch_handler_default = {
  async fetch(request) {
    if (new URL(request.url).pathname === '/throw') {
      throw new Error('Thrown from a package entry');
    }
    return new Response('ok');
  },
};
export { fetch_handler_default as default };
