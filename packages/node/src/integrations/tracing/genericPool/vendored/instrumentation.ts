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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-generic-pool
 * - Upstream version: @opentelemetry/instrumentation-generic-pool@0.61.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { SDK_VERSION, SPAN_STATUS_ERROR, startSpan, startSpanManual } from '@sentry/core';
import type * as genericPool from './generic-pool-types';

const MODULE_NAME = 'generic-pool';
const PACKAGE_NAME = '@sentry/instrumentation-generic-pool';

type AcquireFn = (this: unknown, ...args: unknown[]) => unknown;
interface PoolConstructor {
  prototype: { acquire: AcquireFn };
}
interface GenericPoolModule {
  Pool: PoolConstructor;
}

export class GenericPoolInstrumentation extends InstrumentationBase {
  // only used for v2 - v2.3)
  private _isDisabled = false;

  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition(
        MODULE_NAME,
        ['>=3.0.0 <4'],
        (moduleExports: GenericPoolModule) => {
          const Pool = moduleExports.Pool;
          if (isWrapped(Pool.prototype.acquire)) {
            this._unwrap(Pool.prototype, 'acquire');
          }
          this._wrap(Pool.prototype, 'acquire', this._acquirePatcher.bind(this));
          return moduleExports;
        },
        (moduleExports: GenericPoolModule) => {
          const Pool = moduleExports.Pool;
          this._unwrap(Pool.prototype, 'acquire');
          return moduleExports;
        },
      ),
      new InstrumentationNodeModuleDefinition(
        MODULE_NAME,
        ['>=2.4.0 <3'],
        (moduleExports: GenericPoolModule) => {
          const Pool = moduleExports.Pool;
          if (isWrapped(Pool.prototype.acquire)) {
            this._unwrap(Pool.prototype, 'acquire');
          }
          this._wrap(Pool.prototype, 'acquire', this._acquireWithCallbacksPatcher.bind(this));
          return moduleExports;
        },
        (moduleExports: GenericPoolModule) => {
          const Pool = moduleExports.Pool;
          this._unwrap(Pool.prototype, 'acquire');
          return moduleExports;
        },
      ),
      new InstrumentationNodeModuleDefinition(
        MODULE_NAME,
        ['>=2.0.0 <2.4'],
        (moduleExports: GenericPoolModule) => {
          this._isDisabled = false;
          if (isWrapped(moduleExports.Pool)) {
            this._unwrap(moduleExports, 'Pool');
          }
          this._wrap(moduleExports, 'Pool', this._poolWrapper.bind(this));
          return moduleExports;
        },
        (moduleExports: GenericPoolModule) => {
          // since the object is created on the fly every time, we need to use
          // a boolean switch here to disable the instrumentation
          this._isDisabled = true;
          return moduleExports;
        },
      ),
    ];
  }

  private _acquirePatcher(original: AcquireFn) {
    return function wrapped_acquire(this: genericPool.Pool<unknown>, ...args: unknown[]) {
      return startSpan({ name: 'generic-pool.acquire' }, () => {
        return original.call(this, ...args) as PromiseLike<unknown>;
      });
    };
  }

  private _poolWrapper(original: (this: unknown, ...args: unknown[]) => { acquire: AcquireFn }) {
    const wrap = this._wrap.bind(this);
    const acquireWithCallbacksPatcher = this._acquireWithCallbacksPatcher.bind(this);
    return function wrapped_pool(this: unknown, ...args: unknown[]) {
      const pool = original.apply(this, args);
      wrap(pool, 'acquire', acquireWithCallbacksPatcher);
      return pool;
    };
  }

  private _acquireWithCallbacksPatcher(original: AcquireFn) {
    const isDisabled = (): boolean => this._isDisabled;
    return function wrapped_acquire(
      this: genericPool.Pool<unknown>,
      cb: (err: unknown, client: unknown) => unknown,
      priority: number,
    ) {
      // only used for v2 - v2.3
      if (isDisabled()) {
        return original.call(this, cb, priority);
      }

      return startSpanManual({ name: 'generic-pool.acquire' }, span => {
        original.call(
          this,
          (err: unknown, client: unknown) => {
            if (err) {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            }
            span.end();
            // Not checking whether cb is a function because
            // the original code doesn't do that either.
            // The callback's return value is unused by generic-pool, so we don't return it.
            if (cb) {
              cb(err, client);
            }
          },
          priority,
        );
      });
    };
  }
}
