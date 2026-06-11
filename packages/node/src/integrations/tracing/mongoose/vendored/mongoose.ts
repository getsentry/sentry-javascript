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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongoose
 * - Upstream version: @opentelemetry/instrumentation-mongoose@0.64.0
 * - Types vendored from mongoose as simplified interfaces
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

import { SpanKind } from '@opentelemetry/api';
import {
  InstrumentationBase,
  type InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type { Span, SpanAttributes } from '@sentry/core';
import { getActiveSpan, SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import type * as mongoose from './mongoose-types';
import { ATTR_DB_OPERATION, ATTR_DB_SYSTEM } from './semconv';
import type { MongooseInstrumentationConfig } from './types';
import { getAttributesFromCollection, handleCallbackResponse, handlePromiseResponse } from './utils';

const PACKAGE_NAME = '@sentry/instrumentation-mongoose';
const ORIGIN = 'auto.db.otel.mongoose';

type MongooseModuleExports = typeof mongoose;

// The raw imported `mongoose` module: either the CJS object itself, or an ESM
// namespace wrapper exposing the same shape under `.default`.
type MongooseModule = MongooseModuleExports & {
  default?: MongooseModuleExports;
  [Symbol.toStringTag]?: string;
};

const contextCaptureFunctionsCommon = [
  'deleteOne',
  'deleteMany',
  'find',
  'findOne',
  'estimatedDocumentCount',
  'countDocuments',
  'distinct',
  'where',
  '$where',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
];

const contextCaptureFunctions6 = ['remove', 'count', 'findOneAndRemove', ...contextCaptureFunctionsCommon];
const contextCaptureFunctions7 = ['count', 'findOneAndRemove', ...contextCaptureFunctionsCommon];
const contextCaptureFunctions8 = [...contextCaptureFunctionsCommon];

function getContextCaptureFunctions(moduleVersion: string | undefined): string[] {
  /* istanbul ignore next */
  if (!moduleVersion) {
    return contextCaptureFunctionsCommon;
  } else if (moduleVersion.startsWith('6.') || moduleVersion.startsWith('5.')) {
    return contextCaptureFunctions6;
  } else if (moduleVersion.startsWith('7.')) {
    return contextCaptureFunctions7;
  } else {
    return contextCaptureFunctions8;
  }
}

function instrumentRemove(moduleVersion: string | undefined): boolean {
  return (moduleVersion && (moduleVersion.startsWith('5.') || moduleVersion.startsWith('6.'))) || false;
}

/**
 * 8.21.0 changed Document.updateOne/deleteOne so that the Query is not fully built when Query.exec() is called.
 * @param moduleVersion
 */
function needsDocumentMethodPatch(moduleVersion: string | undefined): boolean {
  if (!moduleVersion || !moduleVersion.startsWith('8.')) {
    return false;
  }

  const minor = parseInt(moduleVersion.split('.')[1]!, 10);
  return minor >= 21;
}

// when mongoose functions are called, we store the original call context
// and then set it as the parent for the spans created by Query/Aggregate exec()
// calls. this bypass the unlinked spans issue on thenables await operations.
export const _STORED_PARENT_SPAN: unique symbol = Symbol('stored-parent-span');

// Prevents double-instrumentation when doc.updateOne/deleteOne (Mongoose 8.21.0+)
// creates a span and returns a Query that also calls exec()
export const _ALREADY_INSTRUMENTED: unique symbol = Symbol('already-instrumented');

export class MongooseInstrumentation extends InstrumentationBase<MongooseInstrumentationConfig> {
  constructor(config: MongooseInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  protected init(): InstrumentationModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(
      'mongoose',
      ['>=5.9.7 <10'],
      this.patch.bind(this),
      this.unpatch.bind(this),
    );
    return module;
  }

  private patch(module: MongooseModule, moduleVersion: string | undefined) {
    const moduleExports: MongooseModuleExports =
      module[Symbol.toStringTag] === 'Module' && module.default ? module.default : module;

    this._wrap(moduleExports.Model.prototype, 'save', this.patchOnModelMethods('save'));
    // mongoose applies this code on module require:
    // Model.prototype.$save = Model.prototype.save;
    // which captures the save function before it is patched.
    // so we need to apply the same logic after instrumenting the save function.
    moduleExports.Model.prototype.$save = moduleExports.Model.prototype.save;

    if (instrumentRemove(moduleVersion)) {
      this._wrap(moduleExports.Model.prototype, 'remove', this.patchOnModelMethods('remove'));
    }

    // Mongoose 8.21.0+ changed Document.updateOne()/deleteOne() so that the Query is not fully built when Query.exec() is called.
    if (needsDocumentMethodPatch(moduleVersion)) {
      this._wrap(moduleExports.Model.prototype, 'updateOne', this._patchDocumentUpdateMethods('updateOne'));
      this._wrap(moduleExports.Model.prototype, 'deleteOne', this._patchDocumentUpdateMethods('deleteOne'));
    }

    this._wrap(moduleExports.Query.prototype, 'exec', this.patchQueryExec());
    this._wrap(moduleExports.Aggregate.prototype, 'exec', this.patchAggregateExec());

    const contextCaptureFunctions = getContextCaptureFunctions(moduleVersion);

    contextCaptureFunctions.forEach((funcName: string) => {
      this._wrap(moduleExports.Query.prototype, funcName as any, this.patchAndCaptureSpanContext(funcName));
    });
    this._wrap(moduleExports.Model, 'aggregate', this.patchModelAggregate());

    this._wrap(moduleExports.Model, 'insertMany', this.patchModelStatic('insertMany'));
    this._wrap(moduleExports.Model, 'bulkWrite', this.patchModelStatic('bulkWrite'));

    return moduleExports;
  }

  private unpatch(module: MongooseModule, moduleVersion: string | undefined): void {
    const moduleExports: MongooseModuleExports =
      module[Symbol.toStringTag] === 'Module' && module.default ? module.default : module;

    const contextCaptureFunctions = getContextCaptureFunctions(moduleVersion);

    this._unwrap(moduleExports.Model.prototype, 'save');
    // revert the patch for $save which we applied by aliasing it to patched `save`
    moduleExports.Model.prototype.$save = moduleExports.Model.prototype.save;

    if (instrumentRemove(moduleVersion)) {
      this._unwrap(moduleExports.Model.prototype, 'remove');
    }

    if (needsDocumentMethodPatch(moduleVersion)) {
      this._unwrap(moduleExports.Model.prototype, 'updateOne');
      this._unwrap(moduleExports.Model.prototype, 'deleteOne');
    }

    this._unwrap(moduleExports.Query.prototype, 'exec');
    this._unwrap(moduleExports.Aggregate.prototype, 'exec');

    contextCaptureFunctions.forEach((funcName: string) => {
      this._unwrap(moduleExports.Query.prototype, funcName as any);
    });
    this._unwrap(moduleExports.Model, 'aggregate');

    this._unwrap(moduleExports.Model, 'insertMany');
    this._unwrap(moduleExports.Model, 'bulkWrite');
  }

  private patchAggregateExec() {
    const self = this;
    return (originalAggregate: Function) => {
      return function exec(this: any, callback?: Function) {
        const parentSpan = this[_STORED_PARENT_SPAN];
        const span = self._startSpan(this._model.collection, this._model?.modelName, 'aggregate', parentSpan);

        return self._handleResponse(span, originalAggregate, this, arguments, callback);
      };
    };
  }

  private patchQueryExec() {
    const self = this;
    return (originalExec: Function) => {
      return function exec(this: any, callback?: Function) {
        // Skip if already instrumented by document instance method patch
        if (this[_ALREADY_INSTRUMENTED]) {
          return originalExec.apply(this, arguments);
        }

        const parentSpan = this[_STORED_PARENT_SPAN];
        const span = self._startSpan(this.mongooseCollection, this.model.modelName, this.op, parentSpan);

        return self._handleResponse(span, originalExec, this, arguments, callback);
      };
    };
  }

  private patchOnModelMethods(op: string) {
    const self = this;
    return (originalOnModelFunction: Function) => {
      return function method(this: any, options?: any, callback?: Function) {
        const span = self._startSpan(this.constructor.collection, this.constructor.modelName, op);

        if (options instanceof Function) {
          // oxlint-disable-next-line no-param-reassign
          callback = options;
        }

        return self._handleResponse(span, originalOnModelFunction, this, arguments, callback);
      };
    };
  }

  // Patch document instance methods (doc.updateOne/deleteOne) for Mongoose 8.21.0+.
  private _patchDocumentUpdateMethods(op: string) {
    const self = this;
    return (originalMethod: Function) => {
      return function method(this: any, update?: any, options?: any, callback?: Function) {
        // determine actual callback since different argument patterns are allowed
        let actualCallback: Function | undefined = callback;
        if (typeof update === 'function') {
          actualCallback = update;
        } else if (typeof options === 'function') {
          actualCallback = options;
        }

        const span = self._startSpan(this.constructor.collection, this.constructor.modelName, op);

        const result = self._handleResponse(span, originalMethod, this, arguments, actualCallback);

        // Mark returned Query to prevent double-instrumentation when exec() is eventually called
        if (result && typeof result === 'object') {
          result[_ALREADY_INSTRUMENTED] = true;
        }

        return result;
      };
    };
  }

  private patchModelStatic(op: string) {
    const self = this;
    return (original: Function) => {
      return function patchedStatic(this: any, docsOrOps: any, options?: any, callback?: Function) {
        if (typeof options === 'function') {
          // oxlint-disable-next-line no-param-reassign
          callback = options;
        }

        const span = self._startSpan(this.collection, this.modelName, op);

        return self._handleResponse(span, original, this, arguments, callback);
      };
    };
  }

  // we want to capture the otel span on the object which is calling exec.
  // in the special case of aggregate, we need have no function to path
  // on the Aggregate object to capture the context on, so we patch
  // the aggregate of Model, and set the context on the Aggregate object
  private patchModelAggregate() {
    return (original: Function) => {
      return function captureSpanContext(this: any) {
        const currentSpan = getActiveSpan();
        const aggregate = original.apply(this, arguments);
        if (aggregate) aggregate[_STORED_PARENT_SPAN] = currentSpan;
        return aggregate;
      };
    };
  }

  private patchAndCaptureSpanContext(_funcName: string) {
    return (original: Function) => {
      return function captureSpanContext(this: any) {
        this[_STORED_PARENT_SPAN] = getActiveSpan();
        return original.apply(this, arguments);
      };
    };
  }

  private _startSpan(collection: mongoose.Collection, modelName: string, operation: string, parentSpan?: Span): Span {
    const attributes: SpanAttributes = {
      ...getAttributesFromCollection(collection),
      [ATTR_DB_OPERATION]: operation,
      [ATTR_DB_SYSTEM]: 'mongoose', // keep for backwards compatibility
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    };

    return startInactiveSpan({
      name: `mongoose.${modelName}.${operation}`,
      kind: SpanKind.CLIENT,
      attributes,
      parentSpan,
    });
  }

  private _handleResponse(span: Span, exec: Function, originalThis: any, args: IArguments, callback?: Function) {
    if (callback instanceof Function) {
      return handleCallbackResponse(callback, exec, originalThis, span, args);
    } else {
      const response = exec.apply(originalThis, args);
      return handlePromiseResponse(response, span);
    }
  }
}
