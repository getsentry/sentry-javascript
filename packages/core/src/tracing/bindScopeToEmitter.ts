import { getCurrentScope, withScope } from '../currentScopes';
import type { Scope } from '../scope';

type BoundListener = (...args: unknown[]) => unknown;

/** Per-event map from user-provided listeners to their scope-bound wrappers. */
type ListenerPatchMap = Record<string, WeakMap<BoundListener, BoundListener> | undefined>;

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

// Guards against double-wrapping when a patched `on`/`addListener` delegates to another patched
// registration method internally. Binding is synchronous, so a module-level flag is safe here.
let isAddingBoundListener = false;

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

function patchAddListener(ee: EventEmitterLike, original: BoundListener, scope: Scope): BoundListener {
  return function (this: unknown, ...args: unknown[]) {
    const event = args[0] as string;
    const listener = args[1];
    // Extra args (e.g. the `options` argument of `addEventListener`) must be forwarded verbatim.
    const rest = args.slice(2);

    // Pass through anything we can't wrap: re-entrant registrations and non-function listeners
    // (e.g. `EventListener` objects passed to `addEventListener`).
    if (isAddingBoundListener || typeof listener !== 'function') {
      return original.apply(this, args);
    }

    const map = getPatchMap(ee) || createPatchMap(ee);
    let listeners = map[event];
    if (!listeners) {
      listeners = new WeakMap();
      map[event] = listeners;
    }

    const boundListener = bindListenerToScope(listener as BoundListener, scope);
    listeners.set(listener as BoundListener, boundListener);

    isAddingBoundListener = true;
    try {
      return original.call(this, event, boundListener, ...rest);
    } finally {
      isAddingBoundListener = false;
    }
  };
}

function patchRemoveListener(ee: EventEmitterLike, original: BoundListener): BoundListener {
  return function (this: unknown, ...args: unknown[]) {
    const event = args[0] as string;
    const listener = args[1];
    const rest = args.slice(2);

    const listeners = getPatchMap(ee)?.[event];
    if (!listeners || typeof listener !== 'function') {
      return original.apply(this, args);
    }
    const boundListener = listeners.get(listener as BoundListener);
    return original.call(this, event, boundListener || (listener as BoundListener), ...rest);
  };
}

function patchRemoveAllListeners(ee: EventEmitterLike, original: BoundListener): BoundListener {
  return function (this: unknown, ...args: unknown[]) {
    const map = getPatchMap(ee);
    if (map) {
      if (args.length === 0) {
        // `removeAllListeners()` with no event clears everything -> reset the map.
        createPatchMap(ee);
      } else {
        const event = args[0] as string;
        map[event] = undefined;
      }
    }
    return original.apply(this, args);
  };
}

function createPatchMap(ee: EventEmitterLike): ListenerPatchMap {
  const map = Object.create(null) as ListenerPatchMap;
  (ee as Record<symbol, ListenerPatchMap>)[SCOPE_BOUND_LISTENERS] = map;
  return map;
}

function getPatchMap(ee: EventEmitterLike): ListenerPatchMap | undefined {
  return (ee as Record<symbol, ListenerPatchMap | undefined>)[SCOPE_BOUND_LISTENERS];
}
