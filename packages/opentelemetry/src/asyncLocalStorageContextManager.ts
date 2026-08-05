/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * This implementation follows the behavior of OpenTelemetry’s `@opentelemetry/context-async-hooks`
 * package, combining logic that upstream splits across:
 * - https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-context-async-hooks/src/AbstractAsyncHooksContextManager.ts
 * - https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-context-async-hooks/src/AsyncLocalStorageContextManager.ts
 * It is a single-class re-implementation for Sentry (not a verbatim copy of those files).
 */

import type { Context, ContextManager } from '@opentelemetry/api';
import { ROOT_CONTEXT } from '@opentelemetry/api';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { EventEmitter } from 'node:events';
import { SENTRY_SCOPES_CONTEXT_KEY } from './constants';
import { buildContextWithSentryScopes } from './utils/buildContextWithSentryScopes';

export type AsyncLocalStorageLookup = {
  asyncLocalStorage: AsyncLocalStorage<unknown>;
  /**
   * Key path traversed through the store to reach the `{ scope, isolationScope }` object, for native
   * threads that read scope out of the AsyncLocalStorage (e.g. `@sentry/node-native`). Omitted when the
   * store already is that object (e.g. the pure AsyncLocalStorage strategy).
   */
  stateLookup?: Array<string | symbol>;
};
type ListenerFn = (...args: unknown[]) => unknown;

/**
 * Per-event map from user listeners to context-bound listeners.
 */
type PatchMap = Record<string, WeakMap<ListenerFn, ListenerFn>>;

const ADD_LISTENER_METHODS = ['addListener', 'on', 'once', 'prependListener', 'prependOnceListener'] as const;

/**
 * OpenTelemetry-compatible context manager using Node.js `AsyncLocalStorage`.
 */
export class SentryAsyncLocalStorageContextManager implements ContextManager {
  protected readonly _asyncLocalStorage: AsyncLocalStorage<Context>;

  private readonly _kOtListeners = Symbol('OtListeners');
  private _wrapped = false;

  public constructor(asyncLocalStorage: AsyncLocalStorage<Context>) {
    this._asyncLocalStorage = asyncLocalStorage;
  }

  public active(): Context {
    return this._asyncLocalStorage.getStore() ?? ROOT_CONTEXT;
  }

  public with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const ctx2 = buildContextWithSentryScopes(context, this.active());
    const cb = thisArg == null ? fn : fn.bind(thisArg);
    return this._asyncLocalStorage.run(ctx2, cb as never, ...args);
  }

  public enable(): this {
    return this;
  }

  public disable(): this {
    try {
      this._asyncLocalStorage.disable();
    } catch {
      // we don't care if something goes wrong here
    }
    return this;
  }

  public bind<T>(context: Context, target: T): T {
    if (isEventEmitter(target)) {
      return this._bindEventEmitter(context, target);
    }
    if (typeof target === 'function') {
      return this._bindFunction(context, target as unknown as ListenerFn) as T;
    }
    return target;
  }

  /**
   * Gets underlying AsyncLocalStorage and symbol to allow lookup of scope.
   * This is Sentry-specific.
   */
  public getAsyncLocalStorageLookup(): AsyncLocalStorageLookup {
    return {
      asyncLocalStorage: this._asyncLocalStorage,
      stateLookup: ['_currentContext', SENTRY_SCOPES_CONTEXT_KEY],
    };
  }

  private _bindFunction(context: Context, target: ListenerFn): ListenerFn {
    const managerWith = this.with.bind(this);
    const contextWrapper = function (this: never, ...args: unknown[]) {
      return managerWith(context, () => target.apply(this, args));
    };
    Object.defineProperty(contextWrapper, 'length', {
      enumerable: false,
      configurable: true,
      writable: false,
      value: target.length,
    });
    return contextWrapper;
  }

  private _bindEventEmitter<T extends EventEmitter>(context: Context, ee: T): T {
    if (this._getPatchMap(ee) !== undefined) {
      return ee;
    }
    if (this._createPatchMap(ee) === undefined) {
      return ee;
    }

    for (const methodName of ADD_LISTENER_METHODS) {
      const original = getMethod(ee, methodName);
      if (!original) continue;
      trySetMethod(ee, methodName, this._patchAddListener(ee, original, context));
    }
    for (const methodName of ['removeListener', 'off'] as const) {
      const original = getMethod(ee, methodName);
      if (!original) continue;
      trySetMethod(ee, methodName, this._patchRemoveListener(ee, original));
    }
    const removeAllListeners = getMethod(ee, 'removeAllListeners');
    if (removeAllListeners) {
      trySetMethod(ee, 'removeAllListeners', this._patchRemoveAllListeners(ee, removeAllListeners));
    }
    return ee;
  }

  private _patchRemoveListener(ee: EventEmitter, original: (...args: unknown[]) => unknown) {
    // oxlint-disable-next-line @typescript-eslint/no-this-alias
    const contextManager = this;
    return function (this: unknown, event: string, listener: ListenerFn) {
      const events = contextManager._getPatchMap(ee)?.[event];
      if (events === undefined) {
        return original.call(this, event, listener);
      }
      const patchedListener = events.get(listener);
      return original.call(this, event, patchedListener || listener);
    };
  }

  private _patchRemoveAllListeners(ee: EventEmitter, original: (...args: unknown[]) => unknown) {
    // oxlint-disable-next-line @typescript-eslint/no-this-alias
    const contextManager = this;
    return function (this: unknown, event?: string) {
      const map = contextManager._getPatchMap(ee);
      if (map !== undefined) {
        if (arguments.length === 0) {
          // Best-effort reset: if the emitter was frozen after binding, this cannot replace the map
          // (and the map itself could not be cleared in place either). A stale map is harmless though —
          // `_patchAddListener` overwrites entries when a listener is re-added, and `_patchRemoveListener`
          // passing an already-unregistered wrapper to `original` is a no-op.
          contextManager._createPatchMap(ee);
        } else if (event !== undefined && map[event] !== undefined) {
          // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- event-keyed listener map
          delete map[event];
        }
      }
      return original.apply(this, arguments);
    };
  }

  private _patchAddListener(ee: EventEmitter, original: (...args: unknown[]) => unknown, context: Context) {
    // oxlint-disable-next-line @typescript-eslint/no-this-alias
    const contextManager = this;
    return function (this: unknown, event: string, listener: ListenerFn) {
      if (contextManager._wrapped) {
        return original.call(this, event, listener);
      }
      const map = contextManager._getPatchMap(ee) ?? contextManager._createPatchMap(ee);
      if (map === undefined) {
        return original.call(this, event, listener);
      }
      let listeners = map[event];
      if (listeners === undefined) {
        listeners = new WeakMap();
        map[event] = listeners;
      }
      const patchedListener = contextManager.bind(context, listener);
      listeners.set(listener, patchedListener);

      contextManager._wrapped = true;
      try {
        return original.call(this, event, patchedListener);
      } finally {
        contextManager._wrapped = false;
      }
    };
  }

  /**
   * Attach a fresh patch map to the emitter. Returns `undefined` if the emitter does not accept the
   * property (e.g. it is frozen or sealed), in which case the emitter must not be patched at all —
   * without a patch map the remove-listener patches could not resolve their wrapped listeners.
   */
  private _createPatchMap(ee: EventEmitter): PatchMap | undefined {
    const map = Object.create(null) as PatchMap;
    try {
      (ee as unknown as Record<symbol, PatchMap>)[this._kOtListeners] = map;
    } catch {
      return undefined;
    }
    return this._getPatchMap(ee) === map ? map : undefined;
  }

  private _getPatchMap(ee: EventEmitter): PatchMap | undefined {
    return (ee as unknown as Record<symbol, PatchMap | undefined>)[this._kOtListeners];
  }
}

/**
 * Duck-typed `EventEmitter` check.
 *
 * We use this instead of `instanceof EventEmitter` so it also works in non-Node.js environments (e.g. vercel-edge)
 * and across realms. Both `on` and `emit` must be callable — checking only for the presence of an `on` property
 * would classify plain objects like `{ on: true }` as emitters and later try to call a non-function.
 */
function isEventEmitter(target: unknown): target is EventEmitter {
  if (typeof target !== 'object' || !target) {
    return false;
  }
  const candidate = target as Partial<Record<'on' | 'emit', unknown>>;
  return typeof candidate.on === 'function' && typeof candidate.emit === 'function';
}

/**
 * Read a method off an emitter, ignoring inherited or own properties that are not callable.
 */
function getMethod<T extends EventEmitter>(ee: T, methodName: keyof EventEmitter): ListenerFn | undefined {
  const value = (ee as unknown as Record<string, unknown>)[methodName as string];
  return typeof value === 'function' ? (value as ListenerFn) : undefined;
}

/**
 * Assign a patched method back onto the emitter. Emitters may be frozen or expose getter-only methods,
 * in which case we leave the original method in place instead of throwing.
 */
function trySetMethod<T extends EventEmitter>(
  ee: T,
  methodName: keyof EventEmitter,
  patched: (...args: never[]) => unknown,
): void {
  try {
    (ee as unknown as Record<string, unknown>)[methodName as string] = patched;
  } catch {
    // Nothing to do, the emitter keeps its unpatched method
  }
}
