import type { ClientOptions } from '@sentry/core';
import { createTransport, resolvedSyncPromise } from '@sentry/core';

export function getDefaultNodeClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    dsn: 'http://examplePublicKey@localhost/0',
    traceLifecycle: 'static',
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}

/**
 * Mimics SvelteKit's dependency tracking: reads of `url` and `route` members are recorded
 * unless they happen inside `untrack`.
 */
export function createTrackedLoadEvent<T extends object>(
  event: T & { url: URL; route: { id: string | null } },
): { event: T & { untrack: <R>(fn: () => R) => R }; trackedReads: string[] } {
  const trackedReads: string[] = [];
  let tracking = true;

  const track = <O extends object>(target: O, name: string): O =>
    new Proxy(target, {
      get(target, prop) {
        if (tracking && typeof prop === 'string') {
          trackedReads.push(`${name}.${prop}`);
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

  return {
    event: {
      ...event,
      url: track(event.url, 'url'),
      route: track(event.route, 'route'),
      untrack: <R>(fn: () => R): R => {
        tracking = false;
        try {
          return fn();
        } finally {
          tracking = true;
        }
      },
    },
    trackedReads,
  };
}
