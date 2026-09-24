// Placeholder until the Remix 3 server instrumentation lands. `@sentry/node`'s `init` already emits
// `http.server` spans, so this is useful on its own; route parameterisation and router error capture
// are what is still missing.
export * from '@sentry/node';
