import type { Context } from 'hono';
/**
 * Checks whether the given Hono context has a fetch event.
 */
export function hasFetchEvent(c: Context): boolean {
  let hasFetchEvent = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    c.event;
  } catch {
    hasFetchEvent = false;
  }
  return hasFetchEvent;
}
