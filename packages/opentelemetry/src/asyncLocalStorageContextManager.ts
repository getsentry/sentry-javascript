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
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { SENTRY_SCOPES_CONTEXT_KEY } from './constants';
import type { AsyncLocalStorageLookup } from './contextManager';
import { buildContextWithSentryScopes } from './utils/buildContextWithSentryScopes';
import { setIsSetup } from './utils/setupCheck';

type ListenerFn = (...args: unknown[]) => unknown;

/**
 * Per-event map from user listeners to context-bound listeners.
 */
type PatchMap = Record<string, WeakMap<ListenerFn, ListenerFn>>;

const ADD_LISTENER_METHODS = ['addListener', 'on', 'once', 'prependListener', 'prependOnceListener'] as const;

/**
 * OpenTelemetry-compatible context manager using Node.js `AsyncLocalStorage`.
 * Semantics match `@opentelemetry/context-async-hooks` (function `bind` + `EventEmitter` patching).
 */
export class SentryAsyncLocalStorageContextManager implements ContextManager {
  protected readonly _asyncLocalStorage = new AsyncLocalStorage<Context>();

  private readonly _kOtListeners = Symbol('OtListeners');
  private _wrapped = false;

  public constructor() {
    setIsSetup('SentryContextManager');
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
    this._asyncLocalStorage.disable();
    return this;
  }

  public bind<T>(context: Context, target: T): T {
    if (target instanceof EventEmitter) {
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
      contextSymbol: SENTRY_SCOPES_CONTEXT_KEY,
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
    this._createPatchMap(ee);

    for (const methodName of ADD_LISTENER_METHODS) {
      if (ee[methodName] === undefined) continue;
      ee[methodName] = this._patchAddListener(
        ee,
        ee[methodName] as unknown as (...args: unknown[]) => unknown,
        context,
      );
    }
    if (typeof ee.removeListener === 'function') {
      // oxlint-disable-next-line @typescript-eslint/unbound-method -- patched like upstream OTel context manager
      ee.removeListener = this._patchRemoveListener(ee, ee.removeListener as (...args: unknown[]) => unknown);
    }
    if (typeof ee.off === 'function') {
      // oxlint-disable-next-line @typescript-eslint/unbound-method
      ee.off = this._patchRemoveListener(ee, ee.off as (...args: unknown[]) => unknown);
    }
    if (typeof ee.removeAllListeners === 'function') {
      ee.removeAllListeners = this._patchRemoveAllListeners(
        ee,
        // oxlint-disable-next-line @typescript-eslint/unbound-method
        ee.removeAllListeners as (...args: unknown[]) => unknown,
      );
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
      let map = contextManager._getPatchMap(ee);
      if (map === undefined) {
        map = contextManager._createPatchMap(ee);
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

  private _createPatchMap(ee: EventEmitter): PatchMap {
    const map = Object.create(null) as PatchMap;
    (ee as unknown as Record<symbol, PatchMap>)[this._kOtListeners] = map;
    return map;
  }

  private _getPatchMap(ee: EventEmitter): PatchMap | undefined {
    return (ee as unknown as Record<symbol, PatchMap | undefined>)[this._kOtListeners];
  }
}
