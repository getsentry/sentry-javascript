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
 * - Code vendored from: https://github.com/open-telemetry/opentelemetry-js/blob/6515ed8098333646a63a74a8c0150cc2daf520db/packages/opentelemetry-context-async-hooks/src/AbstractAsyncHooksContextManager.ts
 * - Modifications:
 *   - Added lint rules
 *   - Modified import path to AbstractAsyncHooksContextManager
 *   - Added Sentry logging
 *   - Modified constructor to access AsyncLocalStorage class from global object instead of the Node.js API
 */

/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Context } from '@opentelemetry/api';
import { ROOT_CONTEXT } from '@opentelemetry/api';
import { debug, GLOBAL_OBJ } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { AbstractAsyncHooksContextManager } from './abstract-async-hooks-context-manager';

// Inline AsyncLocalStorage interface to avoid Node.js module dependency
// This prevents Node.js type leaks in edge runtime environments
interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R;
  disable(): void;
}

export class AsyncLocalStorageContextManager extends AbstractAsyncHooksContextManager {
  private _asyncLocalStorage: AsyncLocalStorage<Context>;

  constructor() {
    super();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const MaybeGlobalAsyncLocalStorageConstructor = (GLOBAL_OBJ as any).AsyncLocalStorage;

    if (!MaybeGlobalAsyncLocalStorageConstructor) {
      DEBUG_BUILD &&
        debug.warn(
          "Tried to register AsyncLocalStorage async context strategy in a runtime that doesn't support AsyncLocalStorage.",
        );

      this._asyncLocalStorage = {
        getStore() {
          return undefined;
        },
        run<R>(_store: Context, callback: (...args: any[]) => R, ...args: any[]): R {
          return callback.apply(this, args);
        },
        disable() {
          // noop
        },
      };
    } else {
      this._asyncLocalStorage = new MaybeGlobalAsyncLocalStorageConstructor();
    }
  }

  active(): Context {
    return this._asyncLocalStorage.getStore() ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const cb = thisArg == null ? fn : fn.bind(thisArg);
    return this._asyncLocalStorage.run(context, cb as never, ...args);
  }

  enable(): this {
    return this;
  }

  disable(): this {
    this._asyncLocalStorage.disable();
    return this;
  }
}
