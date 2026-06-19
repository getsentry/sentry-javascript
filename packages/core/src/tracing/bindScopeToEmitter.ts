import { getCurrentScope, withScope } from '../currentScopes';
import type { Scope } from '../scope';

type BoundListener = (...args: unknown[]) => unknown;

/**
 * Per-event map from a user-provided listener to its single scope-bound wrapper. We reuse one stable
 * wrapper per listener (rather than minting a new one per registration) and let the underlying
 * emitter/target handle repeat registrations:
 * - Node's `EventEmitter` allows duplicates and counts them, so registering the same wrapper N times
 *   fires N times and `removeListener` removes one instance per call — no orphaned wrappers.
 * - the DOM `EventTarget` dedupes by `(type, callback, capture)`, so reusing the wrapper preserves
 *   that idempotency; a fresh wrapper per call would defeat it and fire the listener repeatedly.
 */
type ListenerPatchMap = Map<string, WeakMap<BoundListener, BoundListener>>;

// We patch both Node.js `EventEmitter` registration methods (`on`, `addListener`, ...) and the DOM
// `EventTarget.addEventListener`, so this works for Node emitters and browser-native event targets.

/** Listener-registration methods we patch so listeners inherit the bound scope. */
const ADD_LISTENER_METHODS = [
  'addListener',
  'on',
  'once',
  'prependListener',
  'prependOnceListener',
  'addEventListener',
] as const;
/** Listener-removal methods we patch so removals find the scope-bound wrapper. */
const REMOVE_LISTENER_METHODS = ['removeListener', 'off', 'removeEventListener'] as const;

/** Symbol under which the patch map is stashed on a bound emitter. */
const SCOPE_BOUND_LISTENERS = Symbol('SentryScopeBoundListeners');

/**
 * Minimal structural type for a Node.js-style `EventEmitter` or DOM `EventTarget`. We intentionally
 * avoid importing `node:events` so this stays usable in non-Node environments — objects without any
 * of these methods simply pass through untouched.
 */
type EventEmitterLike = Record<string, unknown>;

// Tracks the scope-bound wrapper currently being registered. Node's `once`/`prependOnceListener`
// synchronously re-enter `on`/`prependListener`, passing an internal "once wrapper" whose `.listener`
// is our wrapper; that re-entry must not be wrapped again. We scope the guard to that exact wrapper
// rather than using a blanket flag for the whole registration, so unrelated listeners added in the same
// synchronous window — e.g. from a Node `newListener` handler, or on another bound emitter — are still
// wrapped and keep their scope. Binding is synchronous, so a module-level value (with save/restore for
// nesting) is safe here.
let registeringWrapper: BoundListener | undefined;

// True when `listener` is the wrapper we're mid-registering, or a Node once-wrapper around it (Node sets
// `.listener` on the once-wrapper to the function we passed). These are the only re-entrant adds to skip.
function isReentrantWrapperRegistration(listener: BoundListener): boolean {
  return (
    registeringWrapper !== undefined &&
    (listener === registeringWrapper || (listener as { listener?: unknown }).listener === registeringWrapper)
  );
}

/**
 * Binds a scope to the given event emitter, so that any listener added to it runs with that scope
 * (and therefore the active span) active — even if the listener fires later, in a different async
 * context.
 *
 * By default the currently active scope is bound, captured at the time this function is called.
 * Pass an explicit `scope` to bind a different one.
 *
 * This is useful when instrumenting APIs that hand back an event emitter (e.g. a streamed database
 * query) whose `'data'` / `'error'` / `'end'` listeners would otherwise lose the trace context.
 *
 * Works with both Node.js `EventEmitter`s (`on`, `addListener`, ...) and DOM `EventTarget`s
 * (`addEventListener`). Objects exposing none of these methods are returned untouched.
 *
 * The isolation scope is intentionally not captured — it is carried along by the active async
 * context. This mirrors the event-emitter behavior of OpenTelemetry's `ContextManager.bind`.
 */
export function bindScopeToEmitter<T extends object>(emitter: T, scope: Scope = getCurrentScope()): T {
  const ee = emitter as EventEmitterLike;

  // Already bound -> nothing to do.
  if (getPatchMap(ee)) {
    return emitter;
  }

  createPatchMap(ee);

  for (const methodName of ADD_LISTENER_METHODS) {
    if (typeof ee[methodName] !== 'function') {
      continue;
    }
    ee[methodName] = patchAddListener(ee, ee[methodName] as BoundListener, scope);
  }

  for (const methodName of REMOVE_LISTENER_METHODS) {
    if (typeof ee[methodName] !== 'function') {
      continue;
    }
    ee[methodName] = patchRemoveListener(ee, ee[methodName] as BoundListener);
  }

  if (typeof ee.removeAllListeners === 'function') {
    ee.removeAllListeners = patchRemoveAllListeners(ee, ee.removeAllListeners as BoundListener);
  }

  return emitter;
}

/** Wraps a listener so it runs with the given scope active. */
function bindListenerToScope(listener: BoundListener, scope: Scope): BoundListener {
  return function (this: unknown, ...args: unknown[]) {
    return withScope(scope, () => listener.apply(this, args));
  };
}

function isBoundListener(listener: unknown): listener is BoundListener {
  return typeof listener === 'function';
}

function patchAddListener(ee: EventEmitterLike, original: BoundListener, scope: Scope): BoundListener {
  return function (this: unknown, ...args: unknown[]) {
    const event = args[0] as string;
    const listener = args[1];
    // Extra args (e.g. the `options` argument of `addEventListener`) must be forwarded verbatim.
    const rest = args.slice(2);

    // Pass through what we must not wrap: non-function listeners (e.g. `EventListener` objects passed to
    // `addEventListener`) and the re-entrant once-wrapper registration. Anything else is wrapped, even
    // when added synchronously mid-registration.
    if (!isBoundListener(listener) || isReentrantWrapperRegistration(listener)) {
      return original.apply(this, args);
    }

    const map = getPatchMap(ee) || createPatchMap(ee);
    let listeners = map.get(event);
    if (!listeners) {
      listeners = new WeakMap();
      map.set(event, listeners);
    }

    // Reuse one stable wrapper per listener so repeat registrations are handled correctly by the
    // underlying emitter/target (Node counts duplicates; the DOM dedupes by `(callback, capture)`).
    let boundListener = listeners.get(listener);
    if (!boundListener) {
      boundListener = bindListenerToScope(listener, scope);
      listeners.set(listener, boundListener);
    }

    const previous = registeringWrapper;
    registeringWrapper = boundListener;
    try {
      return original.call(this, event, boundListener, ...rest);
    } finally {
      registeringWrapper = previous;
    }
  };
}

// Unlike `patchRemoveAllListeners`, this intentionally leaves the map entry in place: Node counts
// duplicate registrations, so the same wrapper may still be registered after removing one instance,
// and later `removeListener` calls need the mapping to find it. The entry is in a `WeakMap` keyed by
// the user listener, so it is GC'd once the user drops their reference — no manual cleanup needed.
function patchRemoveListener(ee: EventEmitterLike, original: BoundListener): BoundListener {
  return function (this: unknown, ...args: unknown[]) {
    const event = args[0] as string;
    const listener = args[1];
    const rest = args.slice(2);

    const boundListener = isBoundListener(listener) ? getPatchMap(ee)?.get(event)?.get(listener) : undefined;
    if (!boundListener) {
      return original.apply(this, args);
    }
    // Pass the same stable wrapper and forward the caller's extra args (e.g. the `capture` option of
    // `removeEventListener`) unchanged, so the emitter/target matches the right registration itself.
    return original.call(this, event, boundListener, ...rest);
  };
}

// Safe to drop map entries here (unlike `patchRemoveListener`): this removes *every* listener for the
// event at once, so no registration referencing those wrappers remains. It also reclaims keys from the
// strong outer `Map` (keyed by event-name strings), which would otherwise accumulate indefinitely.
function patchRemoveAllListeners(ee: EventEmitterLike, original: BoundListener): BoundListener {
  return function (this: unknown, ...args: unknown[]) {
    const map = getPatchMap(ee);
    if (map) {
      if (args.length === 0) {
        // `removeAllListeners()` with no event clears everything -> reset the map.
        createPatchMap(ee);
      } else {
        const event = args[0] as string;
        map.delete(event);
      }
    }
    return original.apply(this, args);
  };
}

function createPatchMap(ee: EventEmitterLike): ListenerPatchMap {
  const map: ListenerPatchMap = new Map();
  (ee as Record<symbol, ListenerPatchMap>)[SCOPE_BOUND_LISTENERS] = map;
  return map;
}

function getPatchMap(ee: EventEmitterLike): ListenerPatchMap | undefined {
  return (ee as Record<symbol, ListenerPatchMap | undefined>)[SCOPE_BOUND_LISTENERS];
}
