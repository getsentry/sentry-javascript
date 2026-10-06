/**
 * A browser stand-in for `node:diagnostics_channel`.
 *
 * Orchestrion's transform injects `import dc from '<dcModule>'` into every instrumented module and
 * drives it through Node's `tracingChannel` API. The browser has no `node:diagnostics_channel`, so
 * without this shim the transform cannot run on browser code.
 *
 * This implements exactly what the injected code calls, which is not the `traceSync` helpers but the
 * per-event channels under them:
 *
 * ```js
 * // The gate is true when ANY of the five event channels has a subscriber, so subscribing to `end`
 * // alone is enough to get the call wrapped.
 * if (!(ch.start.hasSubscribers || ch.end.hasSubscribers || ch.asyncStart.hasSubscribers
 *       || ch.asyncEnd.hasSubscribers || ch.error.hasSubscribers)) return traced();
 * return ch.start.runStores(ctx, () => {
 *   try { ctx.result = traced(); }
 *   catch (err) { ctx.error = err; ch.error.publish(ctx); throw err; }
 *   finally { ch.end.publish(ctx); }
 * });
 * ```
 *
 * The browser has no `AsyncLocalStorage`, so `runStores` publishes and then calls the callback directly
 * instead of entering a store. The injected code does not need a store: it passes state along on the
 * `context` object.
 */

type Handler = (context: unknown) => void;

interface Channel {
  readonly hasSubscribers: boolean;
  publish(context: unknown): void;
  runStores<T>(context: unknown, fn: (...args: unknown[]) => T, thisArg?: unknown, ...args: unknown[]): T;
  subscribe(handler: Handler): void;
  unsubscribe(handler: Handler): void;
}

const EVENTS = ['start', 'end', 'asyncStart', 'asyncEnd', 'error'] as const;
type EventName = (typeof EVENTS)[number];

export type TracingChannelSubscribers = Partial<Record<EventName, Handler>>;

export interface BrowserTracingChannel extends Record<EventName, Channel> {
  subscribe(subscribers: TracingChannelSubscribers): void;
  unsubscribe(subscribers: TracingChannelSubscribers): void;
}

function createChannel(): Channel {
  const handlers = new Set<Handler>();

  return {
    get hasSubscribers(): boolean {
      return handlers.size > 0;
    },
    publish(context) {
      // Snapshot: a subscriber may unsubscribe itself while being notified.
      for (const handler of Array.from(handlers)) {
        try {
          handler(context);
        } catch {
          // A throwing subscriber must never break the instrumented library.
        }
      }
    },
    runStores(context, fn, thisArg, ...args) {
      this.publish(context);
      return fn.apply(thisArg, args);
    },
    subscribe(handler) {
      handlers.add(handler);
    },
    unsubscribe(handler) {
      handlers.delete(handler);
    },
  };
}

declare global {
  // `var`, because only a `var` here becomes a property of `globalThis`.
  // oxlint-disable-next-line no-var
  var __SENTRY_REMIX_DC_REGISTRY__: Map<string, BrowserTracingChannel> | undefined;
}

// On `globalThis`, so a second copy of this module loaded under another URL shares the subscribers
// instead of splitting them. Keyed by the channel names the transform compiles in, so it stays small.
const registry = (globalThis.__SENTRY_REMIX_DC_REGISTRY__ ??= new Map<string, BrowserTracingChannel>());

/** Create (or look up) a tracing channel by name. */
export function tracingChannel(name: string): BrowserTracingChannel {
  const existing = registry.get(name);
  if (existing) {
    return existing;
  }

  const channels = Object.fromEntries(EVENTS.map(event => [event, createChannel()])) as Record<EventName, Channel>;

  const channel: BrowserTracingChannel = {
    ...channels,
    subscribe(subscribers) {
      for (const event of EVENTS) {
        const handler = subscribers[event];
        if (handler) {
          channels[event].subscribe(handler);
        }
      }
    },
    unsubscribe(subscribers) {
      for (const event of EVENTS) {
        const handler = subscribers[event];
        if (handler) {
          channels[event].unsubscribe(handler);
        }
      }
    },
  };

  registry.set(name, channel);
  return channel;
}

export default { tracingChannel };
