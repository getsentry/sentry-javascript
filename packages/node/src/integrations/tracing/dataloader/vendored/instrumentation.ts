/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-dataloader
 * - Upstream version: @opentelemetry/instrumentation-dataloader@0.35.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */

import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { BatchLoadFn, DataLoader, DataLoaderConstructor } from './types';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  startSpan,
} from '@sentry/core';

const MODULE_NAME = 'dataloader';
const PACKAGE_NAME = '@sentry/instrumentation-dataloader';
const ORIGIN = 'auto.db.otel.dataloader';

type LoadFn = DataLoader['load'];
type LoadManyFn = DataLoader['loadMany'];
type PrimeFn = DataLoader['prime'];
type ClearFn = DataLoader['clear'];
type ClearAllFn = DataLoader['clearAll'];

function isModule(module: unknown): module is { [Symbol.toStringTag]: 'Module'; default: DataLoaderConstructor } {
  return (module as { [Symbol.toStringTag]: string })[Symbol.toStringTag] === 'Module';
}

function extractModuleExports(module: unknown): DataLoaderConstructor {
  return isModule(module)
    ? module.default // ESM
    : (module as DataLoaderConstructor); // CommonJS
}

function getSpanName(
  dataloader: DataLoader,
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

export class DataloaderInstrumentation extends InstrumentationBase {
  constructor(config = {}) {
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

  private _wrapBatchLoadFn(batchLoadFn: BatchLoadFn<unknown, unknown>): BatchLoadFn<unknown, unknown> {
    // oxlint-disable-next-line typescript/no-this-alias
    const instrumentation = this;

    return function patchedBatchLoadFn(this: DataLoader, ...args: Parameters<BatchLoadFn<unknown, unknown>>) {
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

  private _getPatchedConstructor(constructor: DataLoaderConstructor): DataLoaderConstructor {
    // oxlint-disable-next-line typescript/no-this-alias
    const instrumentation = this;
    const prototype = constructor.prototype;

    if (!instrumentation.isEnabled()) {
      return constructor;
    }

    // oxlint-disable-next-line typescript/no-explicit-any
    function PatchedDataloader(this: DataLoader, ...args: any[]) {
      // BatchLoadFn is the first constructor argument
      // https://github.com/graphql/dataloader/blob/77c2cd7ca97e8795242018ebc212ce2487e729d2/src/index.js#L47
      if (typeof args[0] === 'function') {
        if (isWrapped(args[0])) {
          instrumentation._unwrap(args, 0);
        }

        args[0] = instrumentation._wrapBatchLoadFn(args[0]);
      }

      return constructor.apply(this, args);
    }

    PatchedDataloader.prototype = prototype;
    return PatchedDataloader as unknown as DataLoaderConstructor;
  }

  private _patchLoad(proto: DataLoader) {
    // oxlint-disable-next-line typescript/unbound-method
    if (isWrapped(proto.load)) {
      this._unwrap(proto, 'load');
    }

    this._wrap(proto, 'load', this._getPatchedLoad.bind(this));
  }

  private _getPatchedLoad(original: LoadFn): LoadFn {
    return function patchedLoad(this: DataLoader, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'load'),
          kind: SPAN_KIND.CLIENT,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getSpanOp('load'),
          },
          onlyIfParent: true,
        },
        span => {
          const result = original.call(this, ...args);

          if (this._batch && span.isRecording()) {
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

  private _patchLoadMany(proto: DataLoader) {
    // oxlint-disable-next-line typescript/unbound-method
    if (isWrapped(proto.loadMany)) {
      this._unwrap(proto, 'loadMany');
    }

    this._wrap(proto, 'loadMany', this._getPatchedLoadMany.bind(this));
  }

  private _getPatchedLoadMany(original: LoadManyFn): LoadManyFn {
    return function patchedLoadMany(this: DataLoader, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'loadMany'),
          kind: SPAN_KIND.CLIENT,
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

  private _patchPrime(proto: DataLoader) {
    // oxlint-disable-next-line typescript/unbound-method
    if (isWrapped(proto.prime)) {
      this._unwrap(proto, 'prime');
    }

    this._wrap(proto, 'prime', this._getPatchedPrime.bind(this));
  }

  private _getPatchedPrime(original: PrimeFn): PrimeFn {
    return function patchedPrime(this: DataLoader, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'prime'),
          kind: SPAN_KIND.CLIENT,
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

  private _patchClear(proto: DataLoader) {
    // oxlint-disable-next-line typescript/unbound-method
    if (isWrapped(proto.clear)) {
      this._unwrap(proto, 'clear');
    }

    this._wrap(proto, 'clear', this._getPatchedClear.bind(this));
  }

  private _getPatchedClear(original: ClearFn): ClearFn {
    return function patchedClear(this: DataLoader, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'clear'),
          kind: SPAN_KIND.CLIENT,
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

  private _patchClearAll(proto: DataLoader) {
    // oxlint-disable-next-line typescript/unbound-method
    if (isWrapped(proto.clearAll)) {
      this._unwrap(proto, 'clearAll');
    }

    this._wrap(proto, 'clearAll', this._getPatchedClearAll.bind(this));
  }

  private _getPatchedClearAll(original: ClearAllFn): ClearAllFn {
    return function patchedClearAll(this: DataLoader, ...args: Parameters<typeof original>) {
      return startSpan(
        {
          name: getSpanName(this, 'clearAll'),
          kind: SPAN_KIND.CLIENT,
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
