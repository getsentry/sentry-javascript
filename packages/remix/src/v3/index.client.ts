// A named list rather than `export * from '@sentry/browser'`: Remix 3 has no bundler, so a wildcard
// makes every export reachable and nothing can be tree shaken out of the served module graph.
//
// `init` is withheld until the Remix 3 browser SDK lands. Re-exporting `@sentry/browser`'s would give
// an app History based tracing, which yields no navigation spans in Remix 3, so it would look
// configured while reporting nothing.
export { captureException, captureMessage } from '@sentry/browser';
export type { BrowserOptions } from '@sentry/browser';
