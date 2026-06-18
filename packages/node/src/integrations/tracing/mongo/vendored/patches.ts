/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongodb
 * - Upstream version: @opentelemetry/instrumentation-mongodb@0.71.0
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

import { getActiveSpan, withActiveSpan } from '@sentry/core';
import type {
  CursorState,
  MongodbNamespace,
  MongoInternalCommand,
  MongoInternalTopology,
  V4Connection,
  V4ConnectionPool,
  WireProtocolInternal,
} from './internal-types';
import { MongodbCommandType } from './internal-types';
import {
  getCommandType,
  getV3SpanAttributes,
  getV4SpanAttributes,
  patchEnd,
  shouldSkipInstrumentation,
  startMongoSpan,
} from './utils';

/** Creates spans for v3 common operations (insert/update/remove). */
export function getV3PatchOperation(operationName: 'insert' | 'update' | 'remove') {
  return (original: WireProtocolInternal[typeof operationName]) => {
    return function patchedServerCommand(
      this: unknown,
      server: MongoInternalTopology,
      ns: string,
      ops: unknown[],
      options: unknown | Function,
      callback?: Function,
    ) {
      const resultHandler = typeof options === 'function' ? options : callback;
      if (shouldSkipInstrumentation() || typeof resultHandler !== 'function' || typeof ops !== 'object') {
        if (typeof options === 'function') {
          return original.call(this, server, ns, ops, options);
        } else {
          return original.call(this, server, ns, ops, options, callback);
        }
      }

      const span = startMongoSpan(getV3SpanAttributes(ns, server, ops[0] as any, operationName));

      const patchedCallback = patchEnd(span, resultHandler);
      // handle when options is the callback to send the correct number of args
      if (typeof options === 'function') {
        return original.call(this, server, ns, ops, patchedCallback);
      } else {
        return original.call(this, server, ns, ops, options, patchedCallback);
      }
    };
  };
}

/** Creates spans for the v3 command operation. */
export function getV3PatchCommand() {
  return (original: WireProtocolInternal['command']) => {
    return function patchedServerCommand(
      this: unknown,
      server: MongoInternalTopology,
      ns: string,
      cmd: MongoInternalCommand,
      options: unknown | Function,
      callback?: Function,
    ) {
      const resultHandler = typeof options === 'function' ? options : callback;

      if (shouldSkipInstrumentation() || typeof resultHandler !== 'function' || typeof cmd !== 'object') {
        if (typeof options === 'function') {
          return original.call(this, server, ns, cmd, options);
        } else {
          return original.call(this, server, ns, cmd, options, callback);
        }
      }

      const commandType = getCommandType(cmd);
      const operationName = commandType === MongodbCommandType.UNKNOWN ? undefined : commandType;
      const span = startMongoSpan(getV3SpanAttributes(ns, server, cmd, operationName));

      const patchedCallback = patchEnd(span, resultHandler);
      // handle when options is the callback to send the correct number of args
      if (typeof options === 'function') {
        return original.call(this, server, ns, cmd, patchedCallback);
      } else {
        return original.call(this, server, ns, cmd, options, patchedCallback);
      }
    };
  };
}

/** Creates spans for the v4 (<6.4) callback-style command operation. */
export function getV4PatchCommandCallback() {
  return (original: V4Connection['commandCallback']) => {
    return function patchedV4ServerCommand(
      this: any,
      ns: MongodbNamespace,
      cmd: any,
      options: undefined | unknown,
      callback: any,
    ) {
      const resultHandler = callback;
      const commandType = Object.keys(cmd)[0];

      if (typeof cmd !== 'object' || cmd.ismaster || cmd.hello) {
        return original.call(this, ns, cmd, options, callback);
      }

      let span = undefined;
      if (!shouldSkipInstrumentation()) {
        span = startMongoSpan(getV4SpanAttributes(this, ns, cmd, commandType));
      }
      const patchedCallback = patchEnd(span, resultHandler);

      return original.call(this, ns, cmd, options, patchedCallback);
    };
  };
}

/** Creates spans for the v4 (>=6.4) promise-style command operation. */
export function getV4PatchCommandPromise() {
  return (original: V4Connection['commandPromise']) => {
    return function patchedV4ServerCommand(this: any, ...args: Parameters<V4Connection['commandPromise']>) {
      const [ns, cmd] = args;
      const commandType = Object.keys(cmd)[0];
      const resultHandler = () => undefined;

      if (typeof cmd !== 'object' || cmd.ismaster || cmd.hello) {
        return original.apply(this, args);
      }

      let span = undefined;
      if (!shouldSkipInstrumentation()) {
        span = startMongoSpan(getV4SpanAttributes(this, ns, cmd, commandType));
      }

      const patchedCallback = patchEnd(span, resultHandler);

      const result = original.apply(this, args);
      result.then(
        (res: any) => patchedCallback(null, res),
        (err: any) => patchedCallback(err),
      );

      return result;
    };
  };
}

/** Creates spans for the v3 find operation. */
export function getV3PatchFind() {
  return (original: WireProtocolInternal['query']) => {
    return function patchedServerCommand(
      this: unknown,
      server: MongoInternalTopology,
      ns: string,
      cmd: MongoInternalCommand,
      cursorState: CursorState,
      options: unknown | Function,
      callback?: Function,
    ) {
      const resultHandler = typeof options === 'function' ? options : callback;

      if (shouldSkipInstrumentation() || typeof resultHandler !== 'function' || typeof cmd !== 'object') {
        if (typeof options === 'function') {
          return original.call(this, server, ns, cmd, cursorState, options);
        } else {
          return original.call(this, server, ns, cmd, cursorState, options, callback);
        }
      }

      const span = startMongoSpan(getV3SpanAttributes(ns, server, cmd, 'find'));

      const patchedCallback = patchEnd(span, resultHandler);
      // handle when options is the callback to send the correct number of args
      if (typeof options === 'function') {
        return original.call(this, server, ns, cmd, cursorState, patchedCallback);
      } else {
        return original.call(this, server, ns, cmd, cursorState, options, patchedCallback);
      }
    };
  };
}

/** Creates spans for the v3 getMore (cursor) operation. */
export function getV3PatchCursor() {
  return (original: WireProtocolInternal['getMore']) => {
    return function patchedServerCommand(
      this: unknown,
      server: MongoInternalTopology,
      ns: string,
      cursorState: CursorState,
      batchSize: number,
      options: unknown | Function,
      callback?: Function,
    ) {
      const resultHandler = typeof options === 'function' ? options : callback;

      if (shouldSkipInstrumentation() || typeof resultHandler !== 'function') {
        if (typeof options === 'function') {
          return original.call(this, server, ns, cursorState, batchSize, options);
        } else {
          return original.call(this, server, ns, cursorState, batchSize, options, callback);
        }
      }

      const span = startMongoSpan(getV3SpanAttributes(ns, server, cursorState.cmd, 'getMore'));

      const patchedCallback = patchEnd(span, resultHandler);
      // handle when options is the callback to send the correct number of args
      if (typeof options === 'function') {
        return original.call(this, server, ns, cursorState, batchSize, patchedCallback);
      } else {
        return original.call(this, server, ns, cursorState, batchSize, options, patchedCallback);
      }
    };
  };
}

// This patch will become unnecessary once https://jira.mongodb.org/browse/NODE-5639 is done.
export function getV4ConnectionPoolCheckOut() {
  return (original: V4ConnectionPool['checkOut']) => {
    return function patchedCheckout(this: unknown, callback: (error: any, connection: any) => void) {
      // The pool runs the callback in a detached context, so re-activate the span that was
      // active when `checkOut` was called — otherwise the pooled operation finds no parent.
      const parentSpan = getActiveSpan();
      return original.call(this, function (this: unknown, ...args: [any, any]) {
        return withActiveSpan(parentSpan ?? null, () => callback.apply(this, args));
      });
    };
  };
}
