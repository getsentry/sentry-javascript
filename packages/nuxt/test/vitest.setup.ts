export function setup() {}

if (!globalThis.fetch) {
  // @ts-expect-error - Needed for vitest to work with our fetch instrumentation
  globalThis.Request = class Request {};
  // @ts-expect-error - Needed for vitest to work with our fetch instrumentation
  globalThis.Response = class Response {};
}
