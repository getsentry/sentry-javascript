// `setAsyncLocalStorageAsyncContextStrategy` is the only server-utils primitive that statically
// imports a `node:` builtin (`node:async_hooks`). Kept out of the shared `exports.ts` barrel (and
// thus out of the `index` / `no-diagnostic-channels` entries) so that browser/edge bundles which
// import any other helper from those barrels don't drag `node:async_hooks` — which bundlers targeting
// those runtimes externalize into an empty stub, breaking the build. Consumers that actually install
// the strategy (Node/Deno/Cloudflare SDKs, all of which run where `node:async_hooks` resolves) import
// it from this dedicated entry.
export { setAsyncLocalStorageAsyncContextStrategy } from './async-context';
