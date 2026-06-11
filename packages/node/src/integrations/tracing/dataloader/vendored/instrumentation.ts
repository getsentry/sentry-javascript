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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-dataloader
 * - Upstream version: @opentelemetry/instrumentation-dataloader@0.35.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */

import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { SpanKind } from '@opentelemetry/api';
import type { DataLoader as Dataloader, DataloaderInstrumentationConfig } from './types';
import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';
import type { SpanLink } from '@sentry/core';

const MODULE_NAME = 'dataloader';
const PACKAGE_NAME = '@sentry/instrumentation-dataloader';
const ORIGIN = 'auto.db.otel.dataloader';

type DataloaderInternal = typeof Dataloader.prototype & {
  _batchLoadFn: Dataloader.BatchLoadFn<unknown, unknown>;
  _batch: { spanLinks?: SpanLink[] } | null;
};

type LoadFn = (typeof Dataloader.prototype)['load'];
type LoadManyFn = (typeof Dataloader.prototype)['loadMany'];
type PrimeFn = (typeof Dataloader.prototype)['prime'];
type ClearFn = (typeof Dataloader.prototype)['clear'];
type ClearAllFn = (typeof Dataloader.prototype)['clearAll'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractModuleExports(module: any) {
  return module[Symbol.toStringTag] === 'Module'
    ? module.default // ESM
    : module; // CommonJS
}

function getSpanName(
  dataloader: DataloaderInternal,
  operation: 'load' | 'loadMany' | 'batch' | 'prime' | 'clear' | 'clearAll',
): string {
  const dataloaderName = dataloader.name;
  if (dataloaderName) {
    return `${MODULE_NAME}.${operation} ${dataloaderName}`;
  }

  return `${MODULE_NAME}.${operation}`;
}

// `load`, `loadMany` and `batch` are all cache reads
function getSpanOp(operation: 'load' | 'loadMany' | 'batch' | 'prime' | 'clear' | 'clearAll'): string | undefined {
  if (operation === 'load' || operation === 'loadMany' || operation === 'batch') {
    return 'cache.get';
  }

  return undefined;
}

export class DataloaderInstrumentation extends InstrumentationBase<DataloaderInstrumentationConfig> {
  constructor(config: DataloaderInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        MODULE_NAME,
        ['>=2.0.0 <3'],
        module => {
          const dataloader = extractModuleExports(module);
          this._patchLoad(dataloader.prototype);
          this._patchLoadMany(dataloader.prototype);
          this._patchPrime(dataloader.prototype);
          this._patchClear(dataloader.prototype);
          this._patchClearAll(dataloader.prototype);

          return this._getPatchedConstructor(dataloader);
        },
        module => {
          const dataloader = extractModuleExports(module);
          ['load', 'loadMany', 'prime', 'clear', 'clearAll'].forEach(method => {
            if (isWrapped(dataloader.prototype[method])) {
              this._unwrap(dataloader.prototype, method);
            }
          });
        },
      ),
    ];
  }

  private _wrapBatchLoadFn(
    batchLoadFn: Dataloader.BatchLoadFn<unknown, unknown>,
  ): Dataloader.BatchLoadFn<unknown, unknown> {
    // oxlint-disable-next-line typescript/no-this-alias
    const instrumentation = this;

    return function patchedBatchLoadFn(
      this: DataloaderInternal,
      ...args: Parameters<Dataloader.BatchLoadFn<unknown, unknown>>
    ) {
      if (!instrumentation.isEnabled()) {
        return batchLoadFn.call(this, ...args);
      }

      return startSpan(
        {
          name: getSpanName(this, 'batch'),
          links: this._batch?.spanLinks,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getSpanOp('batch'),
          },
          onlyIfParent: true,
        },
        () => batchLoadFn.apply(this, args),
      );
    };
  }

  private _getPatchedConstructor(constructor: typeof Dataloader): typeof Dataloader {
    // oxlint-disable-next-line typescript/no-this-alias
    const instrumentation = this;
    const prototype = constructor.prototype;

    if (!instrumentation.isEnabled()) {
      return constructor;
    }

    function PatchedDataloader(this: DataloaderInternal, ...args: any[]) {
      // BatchLoadFn is the first constructor argument
      // https://github.com/graphql/dataloader/blob/77c2cd7ca97e8795242018ebc212ce2487e729d2/src/index.js#L47
      if (typeof args[0] === 'function') {
        if (isWrapped(args[0])) {
          instrumentation._unwrap(args, 0);
        }

        args[0] = instrumentation._wrapBatchLoadFn(args[0]);
      }

      return (constructor as any).apply(this, args);
    }

    PatchedDataloader.prototype = prototype;
    return PatchedDataloader as unknown as typeof Dataloader;
  }

  private _patchLoad(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.load)) {
      this._unwrap(proto, 'load');
    }

    this._wrap(proto, 'load', this._getPatchedLoad.bind(this));
  }

  private _getPatchedLoad(original: LoadFn): LoadFn {
    return function patchedLoad(this: DataloaderInternal, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'load'),
          kind: SpanKind.CLIENT,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getSpanOp('load'),
          },
          onlyIfParent: true,
        },
        span => {
          const result = original.call(this, ...args);

          if (this._batch) {
            if (!this._batch.spanLinks) {
              this._batch.spanLinks = [];
            }

            this._batch.spanLinks.push({ context: span.spanContext() });
          }

          return result;
        },
      );
    };
  }

  private _patchLoadMany(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.loadMany)) {
      this._unwrap(proto, 'loadMany');
    }

    this._wrap(proto, 'loadMany', this._getPatchedLoadMany.bind(this));
  }

  private _getPatchedLoadMany(original: LoadManyFn): LoadManyFn {
    return function patchedLoadMany(this: DataloaderInternal, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'loadMany'),
          kind: SpanKind.CLIENT,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getSpanOp('loadMany'),
          },
          onlyIfParent: true,
        },
        () => original.call(this, ...args),
      );
    };
  }

  private _patchPrime(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.prime)) {
      this._unwrap(proto, 'prime');
    }

    this._wrap(proto, 'prime', this._getPatchedPrime.bind(this));
  }

  private _getPatchedPrime(original: PrimeFn): PrimeFn {
    return function patchedPrime(this: DataloaderInternal, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'prime'),
          kind: SpanKind.CLIENT,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getSpanOp('prime'),
          },
          onlyIfParent: true,
        },
        () => original.call(this, ...args),
      );
    };
  }

  private _patchClear(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.clear)) {
      this._unwrap(proto, 'clear');
    }

    this._wrap(proto, 'clear', this._getPatchedClear.bind(this));
  }

  private _getPatchedClear(original: ClearFn): ClearFn {
    return function patchedClear(this: DataloaderInternal, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'clear'),
          kind: SpanKind.CLIENT,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getSpanOp('clear'),
          },
          onlyIfParent: true,
        },
        () => original.call(this, ...args),
      );
    };
  }

  private _patchClearAll(proto: typeof Dataloader.prototype) {
    if (isWrapped(proto.clearAll)) {
      this._unwrap(proto, 'clearAll');
    }

    this._wrap(proto, 'clearAll', this._getPatchedClearAll.bind(this));
  }

  private _getPatchedClearAll(original: ClearAllFn): ClearAllFn {
    return function patchedClearAll(this: DataloaderInternal, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'clearAll'),
          kind: SpanKind.CLIENT,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getSpanOp('clearAll'),
          },
          onlyIfParent: true,
        },
        () => original.call(this, ...args),
      );
    };
  }
}
