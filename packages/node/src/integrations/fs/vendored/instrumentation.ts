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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-fs
 * - Upstream version: @opentelemetry/instrumentation-fs@0.37.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 * - The OpenTelemetry tracer APIs were replaced with Sentry's `startSpan`/`startInactiveSpan`/`suppressTracing`
 *   and the configurable `createHook`/`endHook`/`requireParentSpan` options were removed in favor of inlined,
 *   Sentry-specific span attributes.
 */

import { context } from '@opentelemetry/api';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  startSpan,
  suppressTracing,
} from '@sentry/core';
import type * as fs from 'fs';
import { promisify } from 'util';
import { CALLBACK_FUNCTIONS, PROMISE_FUNCTIONS, SYNC_FUNCTIONS } from './constants';
import type { FMember, FPMember, FsInstrumentationConfig, GenericFunction } from './types';
import { indexFs } from './utils';

type FS = typeof fs;
type FSPromises = (typeof fs)['promises'];

const PACKAGE_NAME = '@sentry/instrumentation-fs';

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

export class FsInstrumentation extends InstrumentationBase<FsInstrumentationConfig> {
  public constructor(config: FsInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  public init(): InstrumentationNodeModuleDefinition[] {
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
            this._wrap(objectToPatch, functionNameToPatch, this._patchSyncFunction.bind(this, fName));
          }
          for (const fName of CALLBACK_FUNCTIONS) {
            const { objectToPatch, functionNameToPatch } = indexFs(fs, fName);
            if (isWrapped(objectToPatch[functionNameToPatch])) {
              this._unwrap(objectToPatch, functionNameToPatch);
            }
            if (fName === 'exists') {
              // handling separately because of the inconsistent cb style:
              // `exists` doesn't have error as the first argument, but the result
              this._wrap(objectToPatch, functionNameToPatch, this._patchExistsCallbackFunction.bind(this, fName));
              continue;
            }
            this._wrap(objectToPatch, functionNameToPatch, this._patchCallbackFunction.bind(this, fName));
          }
          for (const fName of PROMISE_FUNCTIONS) {
            if (isWrapped(fs.promises[fName])) {
              this._unwrap(fs.promises, fName);
            }
            this._wrap(fs.promises, fName, this._patchPromiseFunction.bind(this, fName));
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
            this._wrap(fsPromises, fName, this._patchPromiseFunction.bind(this, fName));
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

  protected _patchSyncFunction<T extends GenericFunction>(functionName: FMember, original: T): T {
    // oxlint-disable-next-line typescript/no-this-alias
    const instrumentation = this;
    const patchedFunction = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
      const config = instrumentation.getConfig();
      const attributes = getSpanAttributes(functionName, args, config);

      return startSpan({ name: `fs.${functionName}`, onlyIfParent: true, attributes }, span => {
        try {
          // Suppress tracing for internal fs calls
          return suppressTracing(() => original.apply(this, args)) as ReturnType<T>;
        } catch (error) {
          recordError(span, error, config);
          throw error;
        }
      });
    };
    return patchedFunctionWithOriginalProperties(patchedFunction as T, original);
  }

  protected _patchCallbackFunction<T extends GenericFunction>(functionName: FMember, original: T): T {
    // oxlint-disable-next-line typescript/no-this-alias
    const instrumentation = this;
    const patchedFunction = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
      const config = instrumentation.getConfig();

      const lastIdx = args.length - 1;
      const cb: unknown = args[lastIdx];
      if (typeof cb !== 'function') {
        // TODO: what to do if we are pretty sure it's going to throw
        return original.apply(this, args) as ReturnType<T>;
      }

      const attributes = getSpanAttributes(functionName, args, config);
      const span = startInactiveSpan({ name: `fs.${functionName}`, onlyIfParent: true, attributes });

      // Return to the context active during the call in the callback
      args[lastIdx] = context.bind(context.active(), function (this: unknown, ...cbArgs: unknown[]) {
        const error = cbArgs[0];
        if (error) {
          recordError(span, error, config);
        }
        span.end();
        return cb.apply(this, cbArgs);
      });

      try {
        // Suppress tracing for internal fs calls
        return suppressTracing(() => original.apply(this, args)) as ReturnType<T>;
      } catch (error) {
        recordError(span, error, config);
        span.end();
        throw error;
      }
    };
    return patchedFunctionWithOriginalProperties(patchedFunction as T, original);
  }

  protected _patchExistsCallbackFunction<T extends GenericFunction>(functionName: 'exists', original: T): T {
    // oxlint-disable-next-line typescript/no-this-alias
    const instrumentation = this;
    const patchedFunction = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
      const config = instrumentation.getConfig();

      const lastIdx = args.length - 1;
      const cb: unknown = args[lastIdx];
      if (typeof cb !== 'function') {
        return original.apply(this, args) as ReturnType<T>;
      }

      const attributes = getSpanAttributes(functionName, args, config);
      const span = startInactiveSpan({ name: `fs.${functionName}`, onlyIfParent: true, attributes });

      // Return to the context active during the call in the callback
      args[lastIdx] = context.bind(context.active(), function (this: unknown, ...cbArgs: unknown[]) {
        // `exists` never calls the callback with an error
        span.end();
        return cb.apply(this, cbArgs);
      });

      try {
        // Suppress tracing for internal fs calls
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

  protected _patchPromiseFunction<T extends GenericFunction>(functionName: FPMember, original: T): T {
    // oxlint-disable-next-line typescript/no-this-alias
    const instrumentation = this;
    const patchedFunction = async function (this: unknown, ...args: Parameters<T>): Promise<unknown> {
      const config = instrumentation.getConfig();
      const attributes = getSpanAttributes(functionName, args, config);

      return startSpan({ name: `fs.${functionName}`, onlyIfParent: true, attributes }, async span => {
        try {
          // Suppress tracing for internal fs calls
          return await suppressTracing(() => original.apply(this, args) as Promise<unknown>);
        } catch (error) {
          recordError(span, error, config);
          throw error;
        }
      });
    };
    return patchedFunctionWithOriginalProperties(patchedFunction as unknown as T, original);
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
