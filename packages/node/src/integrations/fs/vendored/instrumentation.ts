/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-fs
 * - Upstream version: @opentelemetry/instrumentation-fs@0.37.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */
/* eslint-disable */

import * as api from '@opentelemetry/api';
import { isTracingSuppressed, suppressTracing } from '@opentelemetry/core';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { CALLBACK_FUNCTIONS, PROMISE_FUNCTIONS, SYNC_FUNCTIONS } from './constants';
import type * as fs from 'fs';
import type { FMember, FPMember, CreateHook, EndHook, FsInstrumentationConfig } from './types';
import { promisify } from 'util';
import { indexFs } from './utils';

type FS = typeof fs;
type FSPromises = (typeof fs)['promises'];

const PACKAGE_NAME = '@sentry/instrumentation-fs';

/**
 * This is important for 2-level functions like `realpath.native` to retain the 2nd-level
 * when patching the 1st-level.
 */
function patchedFunctionWithOriginalProperties<T extends (...args: any[]) => ReturnType<T>>(
  patchedFunction: T,
  original: T,
): T {
  return Object.assign(patchedFunction, original);
}

export class FsInstrumentation extends InstrumentationBase<FsInstrumentationConfig> {
  constructor(config: FsInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  init(): (InstrumentationNodeModuleDefinition | InstrumentationNodeModuleDefinition)[] {
    return [
      new InstrumentationNodeModuleDefinition(
        'fs',
        ['*'],
        (fs: FS) => {
          for (const fName of SYNC_FUNCTIONS) {
            const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);

            if (isWrapped(objectToPatch[functionNameToPatch])) {
              this._unwrap(objectToPatch, functionNameToPatch);
            }
            this._wrap(objectToPatch, functionNameToPatch, this._patchSyncFunction.bind(this, fName) as any);
          }
          for (const fName of CALLBACK_FUNCTIONS) {
            const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);
            if (isWrapped(objectToPatch[functionNameToPatch])) {
              this._unwrap(objectToPatch, functionNameToPatch);
            }
            if (fName === 'exists') {
              // handling separately because of the inconsistent cb style:
              // `exists` doesn't have error as the first argument, but the result
              this._wrap(
                objectToPatch,
                functionNameToPatch,
                this._patchExistsCallbackFunction.bind(this, fName) as any,
              );
              continue;
            }
            this._wrap(objectToPatch, functionNameToPatch, this._patchCallbackFunction.bind(this, fName) as any);
          }
          for (const fName of PROMISE_FUNCTIONS) {
            if (isWrapped(fs.promises[fName])) {
              this._unwrap(fs.promises, fName);
            }
            this._wrap(fs.promises, fName, this._patchPromiseFunction.bind(this, fName) as any);
          }
          return fs;
        },
        (fs: FS) => {
          if (fs === undefined) return;
          for (const fName of SYNC_FUNCTIONS) {
            const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);
            if (isWrapped(objectToPatch[functionNameToPatch])) {
              this._unwrap(objectToPatch, functionNameToPatch);
            }
          }
          for (const fName of CALLBACK_FUNCTIONS) {
            const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);
            if (isWrapped(objectToPatch[functionNameToPatch])) {
              this._unwrap(objectToPatch, functionNameToPatch);
            }
          }
          for (const fName of PROMISE_FUNCTIONS) {
            if (isWrapped(fs.promises[fName])) {
              this._unwrap(fs.promises, fName);
            }
          }
        },
      ),
      new InstrumentationNodeModuleDefinition(
        'fs/promises',
        ['*'],
        (fsPromises: FSPromises) => {
          for (const fName of PROMISE_FUNCTIONS) {
            if (isWrapped(fsPromises[fName])) {
              this._unwrap(fsPromises, fName);
            }
            this._wrap(fsPromises, fName, this._patchPromiseFunction.bind(this, fName) as any);
          }
          return fsPromises;
        },
        (fsPromises: FSPromises) => {
          if (fsPromises === undefined) return;
          for (const fName of PROMISE_FUNCTIONS) {
            if (isWrapped(fsPromises[fName])) {
              this._unwrap(fsPromises, fName);
            }
          }
        },
      ),
    ];
  }

  protected _patchSyncFunction<T extends (...args: any[]) => ReturnType<T>>(functionName: FMember, original: T): T {
    const instrumentation = this;
    const patchedFunction = function (this: any, ...args: any[]) {
      const activeContext = api.context.active();

      if (!instrumentation._shouldTrace(activeContext)) {
        return original.apply(this, args);
      }
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(suppressTracing(activeContext), original, this, ...args);
      }

      const span = instrumentation.tracer.startSpan(`fs ${functionName}`) as api.Span;

      try {
        // Suppress tracing for internal fs calls
        const res = api.context.with(suppressTracing(api.trace.setSpan(activeContext, span)), original, this, ...args);
        instrumentation._runEndHook(functionName, { args: args, span });
        return res;
      } catch (error: any) {
        span.recordException(error);
        span.setStatus({
          message: error.message,
          code: api.SpanStatusCode.ERROR,
        });
        instrumentation._runEndHook(functionName, { args: args, span, error });
        throw error;
      } finally {
        span.end();
      }
    };
    return patchedFunctionWithOriginalProperties(patchedFunction as any, original);
  }

  protected _patchCallbackFunction<T extends (...args: any[]) => ReturnType<T>>(functionName: FMember, original: T): T {
    const instrumentation = this;
    const patchedFunction = function (this: any, ...args: any[]) {
      const activeContext = api.context.active();

      if (!instrumentation._shouldTrace(activeContext)) {
        return original.apply(this, args);
      }
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(suppressTracing(activeContext), original, this, ...args);
      }

      const lastIdx = args.length - 1;
      const cb = args[lastIdx];
      if (typeof cb === 'function') {
        const span = instrumentation.tracer.startSpan(`fs ${functionName}`) as api.Span;

        // Return to the context active during the call in the callback
        args[lastIdx] = api.context.bind(activeContext, function (this: unknown, error?: Error) {
          if (error) {
            span.recordException(error);
            span.setStatus({
              message: error.message,
              code: api.SpanStatusCode.ERROR,
            });
          }
          instrumentation._runEndHook(functionName, {
            args: args,
            span,
            error,
          });
          span.end();
          return cb.apply(this, arguments);
        });

        try {
          // Suppress tracing for internal fs calls
          return api.context.with(suppressTracing(api.trace.setSpan(activeContext, span)), original, this, ...args);
        } catch (error: any) {
          span.recordException(error);
          span.setStatus({
            message: error.message,
            code: api.SpanStatusCode.ERROR,
          });
          instrumentation._runEndHook(functionName, {
            args: args,
            span,
            error,
          });
          span.end();
          throw error;
        }
      } else {
        // TODO: what to do if we are pretty sure it's going to throw
        return original.apply(this, args);
      }
    };
    return patchedFunctionWithOriginalProperties(patchedFunction as any, original);
  }

  protected _patchExistsCallbackFunction<T extends (...args: any[]) => ReturnType<T>>(
    functionName: 'exists',
    original: T,
  ): T {
    const instrumentation = this;
    const patchedFunction = function (this: any, ...args: any[]) {
      const activeContext = api.context.active();

      if (!instrumentation._shouldTrace(activeContext)) {
        return original.apply(this, args);
      }
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(suppressTracing(activeContext), original, this, ...args);
      }

      const lastIdx = args.length - 1;
      const cb = args[lastIdx];
      if (typeof cb === 'function') {
        const span = instrumentation.tracer.startSpan(`fs ${functionName}`) as api.Span;

        // Return to the context active during the call in the callback
        args[lastIdx] = api.context.bind(activeContext, function (this: unknown) {
          // `exists` never calls the callback with an error
          instrumentation._runEndHook(functionName, {
            args: args,
            span,
          });
          span.end();
          return cb.apply(this, arguments);
        });

        try {
          // Suppress tracing for internal fs calls
          return api.context.with(suppressTracing(api.trace.setSpan(activeContext, span)), original, this, ...args);
        } catch (error: any) {
          span.recordException(error);
          span.setStatus({
            message: error.message,
            code: api.SpanStatusCode.ERROR,
          });
          instrumentation._runEndHook(functionName, {
            args: args,
            span,
            error,
          });
          span.end();
          throw error;
        }
      } else {
        return original.apply(this, args);
      }
    };
    const functionWithOriginalProperties = patchedFunctionWithOriginalProperties(patchedFunction, original);

    // `exists` has a custom promisify function because of the inconsistent signature
    // replicating that on the patched function
    const promisified = function (path: unknown) {
      return new Promise(resolve => functionWithOriginalProperties(path, resolve));
    };
    Object.defineProperty(promisified, 'name', { value: functionName });
    Object.defineProperty(functionWithOriginalProperties, promisify.custom, {
      value: promisified,
    });

    return functionWithOriginalProperties as T;
  }

  protected _patchPromiseFunction<T extends (...args: any[]) => ReturnType<T>>(functionName: FPMember, original: T): T {
    const instrumentation = this;
    const patchedFunction = async function (this: any, ...args: any[]) {
      const activeContext = api.context.active();

      if (!instrumentation._shouldTrace(activeContext)) {
        return original.apply(this, args);
      }
      if (
        instrumentation._runCreateHook(functionName, {
          args: args,
        }) === false
      ) {
        return api.context.with(suppressTracing(activeContext), original, this, ...args);
      }

      const span = instrumentation.tracer.startSpan(`fs ${functionName}`) as api.Span;

      try {
        // Suppress tracing for internal fs calls
        const res = await api.context.with(
          suppressTracing(api.trace.setSpan(activeContext, span)),
          original,
          this,
          ...args,
        );
        instrumentation._runEndHook(functionName, { args: args, span });
        return res;
      } catch (error: any) {
        span.recordException(error);
        span.setStatus({
          message: error.message,
          code: api.SpanStatusCode.ERROR,
        });
        instrumentation._runEndHook(functionName, { args: args, span, error });
        throw error;
      } finally {
        span.end();
      }
    };
    return patchedFunctionWithOriginalProperties(patchedFunction as any, original);
  }

  protected _runCreateHook(...args: Parameters<CreateHook>): ReturnType<CreateHook> {
    const { createHook } = this.getConfig();
    if (typeof createHook === 'function') {
      try {
        return createHook(...args);
      } catch (e) {
        this._diag.error('caught createHook error', e);
      }
    }
    return true;
  }

  protected _runEndHook(...args: Parameters<EndHook>): ReturnType<EndHook> {
    const { endHook } = this.getConfig();
    if (typeof endHook === 'function') {
      try {
        endHook(...args);
      } catch (e) {
        this._diag.error('caught endHook error', e);
      }
    }
  }

  protected _shouldTrace(context: api.Context): boolean {
    if (isTracingSuppressed(context)) {
      // Performance optimization. Avoid creating additional contexts and spans
      // if we already know that the tracing is being suppressed.
      return false;
    }

    const { requireParentSpan } = this.getConfig();
    if (requireParentSpan) {
      const parentSpan = api.trace.getSpan(context);
      if (parentSpan == null) {
        return false;
      }
    }

    return true;
  }
}
