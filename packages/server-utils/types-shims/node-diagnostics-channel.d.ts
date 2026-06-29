/**
 * Ambient shim for `node:diagnostics_channel`, injected into the TS 3.8 type output only
 * (see `scripts/inject-ts38-shims.mjs`).
 *
 * `@types/node@14` — used by the SDK's TS 3.8 compatibility check — predates this module, so the
 * published declarations that re-export `TracingChannel`/`TracingChannelSubscribers` fail to resolve
 * it (`TS2307`). The real shapes are irrelevant here: TS 3.8 consumers only need these to type-check,
 * never to call. This file is deliberately kept out of `src/` so it never participates in the modern
 * build, where `@types/node` already declares the module.
 */
declare module 'node:diagnostics_channel' {
  export interface TracingChannelSubscribers<ContextType = unknown> {
    [key: string]: unknown;
  }

  export interface TracingChannel<StoreType = unknown, ContextType = unknown> {
    [key: string]: unknown;
  }
}
