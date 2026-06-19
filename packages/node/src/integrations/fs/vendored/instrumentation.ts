/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-fs
 * - Upstream version: @opentelemetry/instrumentation-fs@0.37.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 * - The OpenTelemetry tracer APIs were replaced with Sentry's `startSpan`/`startInactiveSpan`/`suppressTracing`
 *   and the configurable `createHook`/`endHook`/`requireParentSpan` options were removed in favor of inlined,
 *   Sentry-specific span attributes.
 * - Completely reworked to create Sentry spans rather than OTel spans.
 */

import type { Span, SpanAttributes } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  getActiveSpan,
  startInactiveSpan,
  startSpan,
  suppressTracing,
  withActiveSpan,
} from '@sentry/core';
import * as fs from 'fs';
import { promisify } from 'util';
import { CALLBACK_FUNCTIONS, PROMISE_FUNCTIONS, SYNC_FUNCTIONS } from './constants';
import type { FMember, FPMember, FsInstrumentationConfig, GenericFunction } from './types';
import { indexFs } from './utils';

const SPAN_ORIGIN = 'auto.file.fs';
const SPAN_OP = 'file';

// The following lists categorize `fs` functions by the shape of their leading path arguments, so we can
// record meaningful span attributes for them. These are Sentry-specific additions (not part of upstream).
const FS_OPERATIONS_WITH_OLD_PATH_NEW_PATH = ['rename', 'renameSync'];
const FS_OPERATIONS_WITH_SRC_DEST = ['copyFile', 'cp', 'copyFileSync', 'cpSync'];
const FS_OPERATIONS_WITH_EXISTING_PATH_NEW_PATH = ['link', 'linkSync'];
const FS_OPERATIONS_WITH_PREFIX = ['mkdtemp', 'mkdtempSync'];
const FS_OPERATIONS_WITH_TARGET_PATH = ['symlink', 'symlinkSync'];
const FS_OPERATIONS_WITH_PATH_ARG = [
  'access',
  'appendFile',
  'chmod',
  'chown',
  'exists',
  'mkdir',
  'lchown',
  'lstat',
  'lutimes',
  'open',
  'opendir',
  'readdir',
  'readFile',
  'readlink',
  'realpath',
  'realpath.native',
  'rm',
  'rmdir',
  'stat',
  'truncate',
  'unlink',
  'utimes',
  'writeFile',
  'accessSync',
  'appendFileSync',
  'chmodSync',
  'chownSync',
  'existsSync',
  'lchownSync',
  'lstatSync',
  'lutimesSync',
  'opendirSync',
  'mkdirSync',
  'openSync',
  'readdirSync',
  'readFileSync',
  'readlinkSync',
  'realpathSync',
  'realpathSync.native',
  'rmdirSync',
  'rmSync',
  'statSync',
  'truncateSync',
  'unlinkSync',
  'utimesSync',
  'writeFileSync',
];

/**
 * Builds the span attributes for a given `fs` operation, optionally including the file path arguments.
 */
function getSpanAttributes(
  functionName: FMember | FPMember,
  args: ArrayLike<unknown>,
  config: FsInstrumentationConfig,
): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: SPAN_OP,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN,
  };

  if (!config.recordFilePaths) {
    return attributes;
  }

  if (typeof args[0] === 'string' && FS_OPERATIONS_WITH_PATH_ARG.includes(functionName)) {
    attributes['path_argument'] = args[0];
  } else if (typeof args[0] === 'string' && typeof args[1] === 'string') {
    if (FS_OPERATIONS_WITH_TARGET_PATH.includes(functionName)) {
      attributes['target_argument'] = args[0];
      attributes['path_argument'] = args[1];
    } else if (FS_OPERATIONS_WITH_EXISTING_PATH_NEW_PATH.includes(functionName)) {
      attributes['existing_path_argument'] = args[0];
      attributes['new_path_argument'] = args[1];
    } else if (FS_OPERATIONS_WITH_SRC_DEST.includes(functionName)) {
      attributes['src_argument'] = args[0];
      attributes['dest_argument'] = args[1];
    } else if (FS_OPERATIONS_WITH_OLD_PATH_NEW_PATH.includes(functionName)) {
      attributes['old_path_argument'] = args[0];
      attributes['new_path_argument'] = args[1];
    }
  } else if (typeof args[0] === 'string' && FS_OPERATIONS_WITH_PREFIX.includes(functionName)) {
    attributes['prefix_argument'] = args[0];
  }

  return attributes;
}

/**
 * This is important for 2-level functions like `realpath.native` to retain the 2nd-level
 * when patching the 1st-level.
 */
function patchedFunctionWithOriginalProperties<T extends GenericFunction>(patchedFunction: T, original: T): T {
  return Object.assign(patchedFunction, original);
}

// Tracks patched methods to prevent double-patching if `enableFsInstrumentation` is called more than once.
const _patched = new WeakMap<Record<string, GenericFunction>, Set<string>>();

function _patchMethod(
  obj: Record<string, GenericFunction>,
  name: string,
  wrapper: (original: GenericFunction) => GenericFunction,
): void {
  const original = obj[name];
  if (typeof original !== 'function') return;
  let patched = _patched.get(obj);
  if (!patched) {
    patched = new Set();
    _patched.set(obj, patched);
  }
  if (patched.has(name)) return;
  patched.add(name);
  obj[name] = wrapper(original);
}

function _patchSyncFunction<T extends GenericFunction>(
  functionName: FMember,
  original: T,
  config: FsInstrumentationConfig,
): T {
  const patchedFunction = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    const attributes = getSpanAttributes(functionName, args, config);
    return startSpan({ name: `fs.${functionName}`, onlyIfParent: true, attributes }, span => {
      try {
        return suppressTracing(() => original.apply(this, args)) as ReturnType<T>;
      } catch (error) {
        recordError(span, error, config);
        throw error;
      }
    });
  };
  return patchedFunctionWithOriginalProperties(patchedFunction as T, original);
}

function _patchCallbackFunction<T extends GenericFunction>(
  functionName: FMember,
  original: T,
  config: FsInstrumentationConfig,
): T {
  const patchedFunction = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    const lastIdx = args.length - 1;
    const cb: unknown = args[lastIdx];
    if (typeof cb !== 'function') {
      return original.apply(this, args) as ReturnType<T>;
    }

    const attributes = getSpanAttributes(functionName, args, config);
    const span = startInactiveSpan({ name: `fs.${functionName}`, onlyIfParent: true, attributes });
    const parentSpan = getActiveSpan();

    // Wrap the callback to end the span and restore the caller's active span context.
    // fs callbacks fire from Node's I/O event loop where the AsyncLocalStorage context
    // is lost, so any spans created inside the callback would otherwise have no parent.
    args[lastIdx] = function (this: unknown, ...cbArgs: unknown[]) {
      const error = cbArgs[0];
      if (error) {
        recordError(span, error, config);
      }
      span.end();
      if (parentSpan) {
        return withActiveSpan(parentSpan, () => (cb as GenericFunction).apply(this, cbArgs));
      }
      return (cb as GenericFunction).apply(this, cbArgs);
    };

    try {
      return suppressTracing(() => original.apply(this, args)) as ReturnType<T>;
    } catch (error) {
      recordError(span, error, config);
      span.end();
      throw error;
    }
  };
  return patchedFunctionWithOriginalProperties(patchedFunction as T, original);
}

function _patchExistsCallbackFunction<T extends GenericFunction>(original: T, config: FsInstrumentationConfig): T {
  const functionName = 'exists' as FMember;
  const patchedFunction = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    const lastIdx = args.length - 1;
    const cb: unknown = args[lastIdx];
    if (typeof cb !== 'function') {
      return original.apply(this, args) as ReturnType<T>;
    }

    const attributes = getSpanAttributes(functionName, args, config);
    const span = startInactiveSpan({ name: `fs.${functionName}`, onlyIfParent: true, attributes });
    const parentSpan = getActiveSpan();

    // `exists` never calls the callback with an error
    args[lastIdx] = function (this: unknown, ...cbArgs: unknown[]) {
      span.end();
      if (parentSpan) {
        return withActiveSpan(parentSpan, () => (cb as GenericFunction).apply(this, cbArgs));
      }
      return (cb as GenericFunction).apply(this, cbArgs);
    };

    try {
      return suppressTracing(() => original.apply(this, args)) as ReturnType<T>;
    } catch (error) {
      recordError(span, error, config);
      span.end();
      throw error;
    }
  };
  const functionWithOriginalProperties = patchedFunctionWithOriginalProperties(patchedFunction as T, original);

  // `exists` has a custom promisify function because of the inconsistent signature
  // replicating that on the patched function
  const promisified = function (path: unknown): Promise<unknown> {
    return new Promise(resolve => (functionWithOriginalProperties as GenericFunction)(path, resolve));
  };
  Object.defineProperty(promisified, 'name', { value: functionName });
  Object.defineProperty(functionWithOriginalProperties, promisify.custom, {
    value: promisified,
  });

  return functionWithOriginalProperties;
}

function _patchPromiseFunction<T extends GenericFunction>(
  functionName: FPMember,
  original: T,
  config: FsInstrumentationConfig,
): T {
  const patchedFunction = async function (this: unknown, ...args: Parameters<T>): Promise<unknown> {
    const attributes = getSpanAttributes(functionName, args, config);
    return startSpan({ name: `fs.${functionName}`, onlyIfParent: true, attributes }, async span => {
      try {
        return await suppressTracing(() => original.apply(this, args) as Promise<unknown>);
      } catch (error) {
        recordError(span, error, config);
        throw error;
      }
    });
  };
  return patchedFunctionWithOriginalProperties(patchedFunction as unknown as T, original);
}

export function enableFsInstrumentation(config: FsInstrumentationConfig = {}): void {
  for (const fName of SYNC_FUNCTIONS) {
    const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);
    _patchMethod(objectToPatch, functionNameToPatch, original => _patchSyncFunction(fName, original, config));
  }

  for (const fName of CALLBACK_FUNCTIONS) {
    const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);
    if (fName === 'exists') {
      _patchMethod(objectToPatch, functionNameToPatch, original => _patchExistsCallbackFunction(original, config));
    } else {
      _patchMethod(objectToPatch, functionNameToPatch, original => _patchCallbackFunction(fName, original, config));
    }
  }

  // `fs.promises` and `import { readFile } from 'fs/promises'` share the same object in Node 14+,
  // so patching one covers both.
  const fsPromises = fs.promises as unknown as Record<string, GenericFunction>;
  for (const fName of PROMISE_FUNCTIONS) {
    _patchMethod(fsPromises, fName, original => _patchPromiseFunction(fName, original, config));
  }
}

/**
 * Sets the error status on the span and, if configured, records the error message as a span attribute.
 */
function recordError(span: Span, error: unknown, config: FsInstrumentationConfig): void {
  span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  if (config.recordErrorMessagesAsSpanAttributes && error instanceof Error) {
    span.setAttribute('fs_error', error.message);
  }
}
