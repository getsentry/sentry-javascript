// `@cloudflare/workers-types` declares this module, but pulling it in would also add Workers globals
// that clash with the DOM lib the client half of this package is checked against. Only the export
// the SDK reads is declared here; the declaration is build-time only and never emitted.
declare module 'cloudflare:workers' {
  export function waitUntil(promise: Promise<unknown>): void;
}
