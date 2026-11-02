// The web `Request` handler wrapper, on its own entry with no Node.js imports, so Cloudflare can use
// it on workers without the `nodejs_compat` compatibility flag.
export { wrapServerRequestHandler } from './utils/wrapServerRequestHandler';
export type { ServerRequestHandlerConfig } from './utils/wrapServerRequestHandler';
