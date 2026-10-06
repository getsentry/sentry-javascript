/**
 * A workerd-safe `diagnostics_channel` façade for the orchestrion EMIT side, and the
 * `dcModule` target for the Cloudflare orchestrion build (see `vite/index.ts`): orchestrion's
 * transformed code imports `tracingChannel` from here (its default export) instead of
 * `node:diagnostics_channel`.
 *
 * On workerd, `channel.publish()` and `channel.runStores()` throw at module/global scope
 * ("Disallowed operation called within global scope …"); only inside a request handler do they
 * work. `subscribe` and channel creation are fine anywhere. Orchestrion's transformed code emits
 * `start.runStores(...)` / `end.publish(...)` at each wrapped call site, so a library
 * instantiated at module scope (`const app = new Hono()`) throws the moment it is wrapped — or,
 * if no subscriber exists yet, is skipped by the wrapper's `if (!hasSubscribers) return
 * __apm$traced()` short-circuit and never instrumented.
 *
 * This façade delegates to the real `node:diagnostics_channel` singletons — so subscribers, which
 * keep subscribing through `node:diagnostics_channel`, are reached unchanged — and changes two
 * things:
 *
 * 1. `hasSubscribers` always reports `true`, so the wrapper never short-circuits. On Cloudflare a
 *    channel is only injected for an integration that is actually bundled, so the short-circuit
 *    buys nothing — and disabling it is what lets the wrapper run (and reach us) at module scope,
 *    before the per-request cached `init()` has subscribed.
 * 2. When a delegated `publish`/`runStores` throws the global-scope error, the event is queued via
 *    {@link deferChannelEvent} instead. {@link flushDeferredChannelEvents}, called at the top of
 *    the request handler after `init()`, emits it via the real channel — now inside a request,
 *    where publish works.
 *
 * In a request handler nothing throws, so every call is a transparent pass-through to the real
 * channel: lifecycle channels (spans, context binding) behave exactly as on Node.
 */
import * as realDc from 'node:diagnostics_channel';
import { deferChannelEvent, isGlobalScopeError } from './orchestrion-deferred-channels';

type Ctx = Record<string, unknown>;

// One façade per channel name (node's `tracingChannel` is itself a per-name singleton), built
// once when the transformed module declares `const CH = tracingChannel(name)`.
const cache = new Map<string, realDc.TracingChannel>();

// `Channel.hasSubscribers` is a getter on Node but a method on workerd — normalize both to a
// boolean. (This shape difference is also why the emit wrapper never short-circuits on workerd:
// its `if (!ch.start.hasSubscribers)` guard reads a truthy method reference.)
function channelHasSubscribers(ch: realDc.Channel): boolean {
  const value = (ch as { hasSubscribers: unknown }).hasSubscribers;
  return typeof value === 'function' ? Boolean((value as () => unknown).call(ch)) : Boolean(value);
}

function wrapSubChannel(tracing: realDc.TracingChannel, real: realDc.Channel): realDc.Channel {
  return {
    name: real.name,
    // A method (not a getter) so it reads truthy as a property in the emit guard *and* is callable,
    // matching workerd's native shape. Forced `true`: on Cloudflare a channel is only injected for a
    // bundled integration, so the wrapper's no-subscriber short-circuit buys nothing — and disabling
    // it is what lets the wrapper run (and reach us) at module scope before `init()` has subscribed.
    hasSubscribers(): boolean {
      return true;
    },
    publish(ctx: Ctx): void {
      // Snapshot subscriber presence before publishing — it decides whether to defer if the
      // global-scope error fires below.
      const hadSubscribers = channelHasSubscribers(real);
      try {
        real.publish(ctx);
      } catch (error) {
        if (!isGlobalScopeError(error)) {
          throw error;
        }
        // We're at module scope (workerd throws here even with no subscribers). If someone was
        // already subscribed — top-level `Sentry.init()` — workerd delivered to them before
        // throwing, so they got it exactly once; don't defer. Otherwise — the common per-request
        // cached-init case — nobody received it, so defer for a subscriber that registers later
        // (at `init()`), which then gets it exactly once. In a request `publish` doesn't throw,
        // so this path never defers a normal in-request event.
        if (!hadSubscribers) {
          deferChannelEvent(tracing, ctx);
        }
      }
    },
    runStores(ctx: Ctx, fn: (...args: unknown[]) => unknown, ...rest: unknown[]): unknown {
      try {
        return real.runStores(ctx, fn, ...rest);
      } catch (error) {
        if (!isGlobalScopeError(error)) {
          throw error;
        }
        // publish() is gated too, so the store can't be established — just run the wrapped call
        // so its return value (e.g. the constructed instance) is produced now. Its own
        // `end.publish` runs back through this façade and is deferred.
        return fn();
      }
    },
    subscribe: real.subscribe.bind(real),
    unsubscribe: real.unsubscribe.bind(real),
    bindStore: real.bindStore.bind(real),
    unbindStore: real.unbindStore.bind(real),
  } as unknown as realDc.Channel;
}

export function tracingChannel<T = Ctx>(name: string): realDc.TracingChannel<T> {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }

  const real = realDc.tracingChannel(name);
  const facade = {
    start: wrapSubChannel(real, real.start),
    end: wrapSubChannel(real, real.end),
    asyncStart: wrapSubChannel(real, real.asyncStart),
    asyncEnd: wrapSubChannel(real, real.asyncEnd),
    error: wrapSubChannel(real, real.error),
    // Iterator (`:next`) channels call these on the tracingChannel itself; delegate to the real
    // implementation (they only run in-request, where publish/runStores are allowed).
    traceSync: real.traceSync.bind(real),
    tracePromise: real.tracePromise.bind(real),
    traceCallback: real.traceCallback.bind(real),
    subscribe: real.subscribe.bind(real),
    unsubscribe: real.unsubscribe.bind(real),
  } as unknown as realDc.TracingChannel<T>;

  cache.set(name, facade);
  return facade;
}

export const channel = realDc.channel;
export const subscribe = realDc.subscribe;
export const unsubscribe = realDc.unsubscribe;

// Orchestrion's emit imports the default and destructures `tracingChannel`.
export default { tracingChannel, channel, subscribe, unsubscribe };
