// The `Server-Timing` entry that carries the matched route pattern from the server to the browser.
// Shared by the server middleware, which writes it, and the browser SDK, which reads it, so the two
// cannot drift. Nothing in here may pull server code into the client bundle.

export const ROUTE_TIMING_NAME = 'sentry-route';

/** The entry for a route, quoted per the header grammar. */
export function formatRouteTiming(route: string): string {
  return `${ROUTE_TIMING_NAME};desc="${route.replace(/["\\]/g, '\\$&')}"`;
}

/** The route from a raw `Server-Timing` header value, or `undefined` when the entry is absent. */
export function parseRouteTiming(header: string | null | undefined): string | undefined {
  // Everything between the quotes, where a backslash escapes the next character.
  const quoted = header?.match(new RegExp(`(?:^|,)\\s*${ROUTE_TIMING_NAME};desc="((?:[^"\\\\]|\\\\.)*)"`))?.[1];
  return quoted?.replace(/\\(.)/g, '$1');
}
