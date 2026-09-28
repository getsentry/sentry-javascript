// Replaces `--import remix/node-tsx` rather than adding a second flag. Sentry's module hook is
// registered here once the server instrumentation lands, so for now nothing is instrumented.
await import('remix/node-tsx');
