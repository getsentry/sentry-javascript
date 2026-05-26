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
 */
/* eslint-disable */

import { context, Span, trace, Attributes, SpanKind } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import type * as mongoose from './mongoose-types';
import { MongooseInstrumentationConfig, SerializerPayload } from './types';
import { handleCallbackResponse, handlePromiseResponse, getAttributesFromCollection } from './utils';
import {
  InstrumentationBase,
  InstrumentationModuleDefinition,
  InstrumentationNodeModuleDefinition,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { ATTR_DB_OPERATION, ATTR_DB_STATEMENT, ATTR_DB_SYSTEM, DB_SYSTEM_NAME_VALUE_MONGODB } from './semconv';
import { ATTR_DB_OPERATION_NAME, ATTR_DB_QUERY_TEXT, ATTR_DB_SYSTEM_NAME } from '@opentelemetry/semantic-conventions';

const PACKAGE_NAME = '@sentry/instrumentation-mongoose';

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
  private _netSemconvStability!: SemconvStability;
  private _dbSemconvStability!: SemconvStability;

  constructor(config: MongooseInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
    this._setSemconvStabilityFromEnv();
  }

  // Used for testing.
  private _setSemconvStabilityFromEnv() {
    this._netSemconvStability = semconvStabilityFromStr('http', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
    this._dbSemconvStability = semconvStabilityFromStr('database', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
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

  private patch(module: any, moduleVersion: string | undefined) {
    const moduleExports: typeof mongoose = module[Symbol.toStringTag] === 'Module' ? module.default : module;

    this._wrap(moduleExports.Model.prototype, 'save', this.patchOnModelMethods('save', moduleVersion));
    // mongoose applies this code on module require:
    // Model.prototype.$save = Model.prototype.save;
    // which captures the save function before it is patched.
    // so we need to apply the same logic after instrumenting the save function.
    moduleExports.Model.prototype.$save = moduleExports.Model.prototype.save;

    if (instrumentRemove(moduleVersion)) {
      this._wrap(moduleExports.Model.prototype, 'remove', this.patchOnModelMethods('remove', moduleVersion));
    }

    // Mongoose 8.21.0+ changed Document.updateOne()/deleteOne() so that the Query is not fully built when Query.exec() is called.
    if (needsDocumentMethodPatch(moduleVersion)) {
      this._wrap(
        moduleExports.Model.prototype,
        'updateOne',
        this._patchDocumentUpdateMethods('updateOne', moduleVersion),
      );
      this._wrap(
        moduleExports.Model.prototype,
        'deleteOne',
        this._patchDocumentUpdateMethods('deleteOne', moduleVersion),
      );
    }

    this._wrap(moduleExports.Query.prototype, 'exec', this.patchQueryExec(moduleVersion));
    this._wrap(moduleExports.Aggregate.prototype, 'exec', this.patchAggregateExec(moduleVersion));

    const contextCaptureFunctions = getContextCaptureFunctions(moduleVersion);

    contextCaptureFunctions.forEach((funcName: string) => {
      this._wrap(moduleExports.Query.prototype, funcName as any, this.patchAndCaptureSpanContext(funcName));
    });
    this._wrap(moduleExports.Model, 'aggregate', this.patchModelAggregate());

    this._wrap(moduleExports.Model, 'insertMany', this.patchModelStatic('insertMany', moduleVersion));
    this._wrap(moduleExports.Model, 'bulkWrite', this.patchModelStatic('bulkWrite', moduleVersion));

    return moduleExports;
  }

  private unpatch(module: any, moduleVersion: string | undefined): void {
    const moduleExports: typeof mongoose = module[Symbol.toStringTag] === 'Module' ? module.default : module;

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

  private patchAggregateExec(moduleVersion: string | undefined) {
    const self = this;
    return (originalAggregate: Function) => {
      return function exec(this: any, callback?: Function) {
        if (self.getConfig().requireParentSpan && trace.getSpan(context.active()) === undefined) {
          return originalAggregate.apply(this, arguments);
        }

        const parentSpan = this[_STORED_PARENT_SPAN];
        const attributes: Attributes = {};
        const { dbStatementSerializer } = self.getConfig();
        if (dbStatementSerializer) {
          const statement = dbStatementSerializer('aggregate', {
            options: this.options,
            aggregatePipeline: this._pipeline,
          });
          if (self._dbSemconvStability & SemconvStability.OLD) {
            attributes[ATTR_DB_STATEMENT] = statement;
          }
          if (self._dbSemconvStability & SemconvStability.STABLE) {
            attributes[ATTR_DB_QUERY_TEXT] = statement;
          }
        }

        const span = self._startSpan(
          this._model.collection,
          this._model?.modelName,
          'aggregate',
          attributes,
          parentSpan,
        );

        return self._handleResponse(span, originalAggregate, this, arguments, callback, moduleVersion);
      };
    };
  }

  private patchQueryExec(moduleVersion: string | undefined) {
    const self = this;
    return (originalExec: Function) => {
      return function exec(this: any, callback?: Function) {
        // Skip if already instrumented by document instance method patch
        if (this[_ALREADY_INSTRUMENTED]) {
          return originalExec.apply(this, arguments);
        }

        if (self.getConfig().requireParentSpan && trace.getSpan(context.active()) === undefined) {
          return originalExec.apply(this, arguments);
        }

        const parentSpan = this[_STORED_PARENT_SPAN];
        const attributes: Attributes = {};
        const { dbStatementSerializer } = self.getConfig();
        if (dbStatementSerializer) {
          const statement = dbStatementSerializer(this.op, {
            // Use public API methods (getFilter/getOptions) for better compatibility
            condition: this.getFilter?.() ?? this._conditions,
            updates: this._update,
            options: this.getOptions?.() ?? this.options,
            fields: this._fields,
          });
          if (self._dbSemconvStability & SemconvStability.OLD) {
            attributes[ATTR_DB_STATEMENT] = statement;
          }
          if (self._dbSemconvStability & SemconvStability.STABLE) {
            attributes[ATTR_DB_QUERY_TEXT] = statement;
          }
        }
        const span = self._startSpan(this.mongooseCollection, this.model.modelName, this.op, attributes, parentSpan);

        return self._handleResponse(span, originalExec, this, arguments, callback, moduleVersion);
      };
    };
  }

  private patchOnModelMethods(op: string, moduleVersion: string | undefined) {
    const self = this;
    return (originalOnModelFunction: Function) => {
      return function method(this: any, options?: any, callback?: Function) {
        if (self.getConfig().requireParentSpan && trace.getSpan(context.active()) === undefined) {
          return originalOnModelFunction.apply(this, arguments);
        }

        const serializePayload: SerializerPayload = { document: this };
        if (options && !(options instanceof Function)) {
          serializePayload.options = options;
        }
        const attributes: Attributes = {};
        const { dbStatementSerializer } = self.getConfig();
        if (dbStatementSerializer) {
          const statement = dbStatementSerializer(op, serializePayload);
          if (self._dbSemconvStability & SemconvStability.OLD) {
            attributes[ATTR_DB_STATEMENT] = statement;
          }
          if (self._dbSemconvStability & SemconvStability.STABLE) {
            attributes[ATTR_DB_QUERY_TEXT] = statement;
          }
        }
        const span = self._startSpan(this.constructor.collection, this.constructor.modelName, op, attributes);

        if (options instanceof Function) {
          callback = options;
          options = undefined;
        }

        return self._handleResponse(span, originalOnModelFunction, this, arguments, callback, moduleVersion);
      };
    };
  }

  // Patch document instance methods (doc.updateOne/deleteOne) for Mongoose 8.21.0+.
  private _patchDocumentUpdateMethods(op: string, moduleVersion: string | undefined) {
    const self = this;
    return (originalMethod: Function) => {
      return function method(this: any, update?: any, options?: any, callback?: Function) {
        if (self.getConfig().requireParentSpan && trace.getSpan(context.active()) === undefined) {
          return originalMethod.apply(this, arguments);
        }

        // determine actual callback since different argument patterns are allowed
        let actualCallback: Function | undefined = callback;
        let actualUpdate = update;
        let actualOptions = options;

        if (typeof update === 'function') {
          actualCallback = update;
          actualUpdate = undefined;
          actualOptions = undefined;
        } else if (typeof options === 'function') {
          actualCallback = options;
          actualOptions = undefined;
        }

        const attributes: Attributes = {};
        const dbStatementSerializer = self.getConfig().dbStatementSerializer;
        if (dbStatementSerializer) {
          const statement = dbStatementSerializer(op, {
            // Document instance methods automatically use the document's _id as filter
            condition: { _id: this._id },
            updates: actualUpdate,
            options: actualOptions,
          });
          if (self._dbSemconvStability & SemconvStability.OLD) {
            attributes[ATTR_DB_STATEMENT] = statement;
          }
          if (self._dbSemconvStability & SemconvStability.STABLE) {
            attributes[ATTR_DB_QUERY_TEXT] = statement;
          }
        }

        const span = self._startSpan(this.constructor.collection, this.constructor.modelName, op, attributes);

        const result = self._handleResponse(span, originalMethod, this, arguments, actualCallback, moduleVersion);

        // Mark returned Query to prevent double-instrumentation when exec() is eventually called
        if (result && typeof result === 'object') {
          result[_ALREADY_INSTRUMENTED] = true;
        }

        return result;
      };
    };
  }

  private patchModelStatic(op: string, moduleVersion: string | undefined) {
    const self = this;
    return (original: Function) => {
      return function patchedStatic(this: any, docsOrOps: any, options?: any, callback?: Function) {
        if (self.getConfig().requireParentSpan && trace.getSpan(context.active()) === undefined) {
          return original.apply(this, arguments);
        }
        if (typeof options === 'function') {
          callback = options;
          options = undefined;
        }

        const serializePayload: SerializerPayload = {};
        switch (op) {
          case 'insertMany':
            serializePayload.documents = docsOrOps;
            break;
          case 'bulkWrite':
            serializePayload.operations = docsOrOps;
            break;
          default:
            serializePayload.document = docsOrOps;
            break;
        }
        if (options !== undefined) {
          serializePayload.options = options;
        }

        const attributes: Attributes = {};
        const { dbStatementSerializer } = self.getConfig();
        if (dbStatementSerializer) {
          const statement = dbStatementSerializer(op, serializePayload);
          if (self._dbSemconvStability & SemconvStability.OLD) {
            attributes[ATTR_DB_STATEMENT] = statement;
          }
          if (self._dbSemconvStability & SemconvStability.STABLE) {
            attributes[ATTR_DB_QUERY_TEXT] = statement;
          }
        }

        const span = self._startSpan(this.collection, this.modelName, op, attributes);

        return self._handleResponse(span, original, this, arguments, callback, moduleVersion);
      };
    };
  }

  // we want to capture the otel span on the object which is calling exec.
  // in the special case of aggregate, we need have no function to path
  // on the Aggregate object to capture the context on, so we patch
  // the aggregate of Model, and set the context on the Aggregate object
  private patchModelAggregate() {
    const self = this;
    return (original: Function) => {
      return function captureSpanContext(this: any) {
        const currentSpan = trace.getSpan(context.active());
        const aggregate = self._callOriginalFunction(() => original.apply(this, arguments));
        if (aggregate) aggregate[_STORED_PARENT_SPAN] = currentSpan;
        return aggregate;
      };
    };
  }

  private patchAndCaptureSpanContext(funcName: string) {
    const self = this;
    return (original: Function) => {
      return function captureSpanContext(this: any) {
        this[_STORED_PARENT_SPAN] = trace.getSpan(context.active());
        return self._callOriginalFunction(() => original.apply(this, arguments));
      };
    };
  }

  private _startSpan(
    collection: mongoose.Collection,
    modelName: string,
    operation: string,
    attributes: Attributes,
    parentSpan?: Span,
  ): Span {
    const finalAttributes: Attributes = {
      ...attributes,
      ...getAttributesFromCollection(collection, this._dbSemconvStability, this._netSemconvStability),
    };

    if (this._dbSemconvStability & SemconvStability.OLD) {
      finalAttributes[ATTR_DB_OPERATION] = operation;
      finalAttributes[ATTR_DB_SYSTEM] = 'mongoose'; // keep for backwards compatibility
    }
    if (this._dbSemconvStability & SemconvStability.STABLE) {
      finalAttributes[ATTR_DB_OPERATION_NAME] = operation;
      finalAttributes[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_MONGODB; // actual db system name
    }

    const spanName =
      this._dbSemconvStability & SemconvStability.STABLE
        ? `${operation} ${collection.name}`
        : `mongoose.${modelName}.${operation}`;

    return this.tracer.startSpan(
      spanName,
      {
        kind: SpanKind.CLIENT,
        attributes: finalAttributes,
      },
      parentSpan ? trace.setSpan(context.active(), parentSpan) : undefined,
    );
  }

  private _handleResponse(
    span: Span,
    exec: Function,
    originalThis: any,
    args: IArguments,
    callback?: Function,
    moduleVersion: string | undefined = undefined,
  ) {
    const self = this;
    if (callback instanceof Function) {
      return self._callOriginalFunction(() =>
        handleCallbackResponse(callback, exec, originalThis, span, args, self.getConfig().responseHook, moduleVersion),
      );
    } else {
      const response = self._callOriginalFunction(() => exec.apply(originalThis, args));
      return handlePromiseResponse(response, span, self.getConfig().responseHook, moduleVersion);
    }
  }

  private _callOriginalFunction<T>(originalFunction: (...args: any[]) => T): T {
    if (this.getConfig().suppressInternalInstrumentation) {
      return context.with(suppressTracing(context.active()), originalFunction);
    } else {
      return originalFunction();
    }
  }
}
