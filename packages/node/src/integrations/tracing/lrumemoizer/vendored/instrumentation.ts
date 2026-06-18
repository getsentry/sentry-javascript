/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-lru-memoizer
 * - Upstream version: @opentelemetry/instrumentation-lru-memoizer@0.62.0
 */

import { context } from '@opentelemetry/api';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';

const PACKAGE_NAME = '@sentry/instrumentation-lru-memoizer';

type Memoizer = (this: unknown, ...args: unknown[]) => unknown;
type LruMemoizerModule = ((this: unknown, ...args: unknown[]) => Memoizer) & { sync: unknown };

export class LruMemoizerInstrumentation extends InstrumentationBase {
  constructor() {
    super(PACKAGE_NAME, SDK_VERSION, {});
  }

  init(): InstrumentationNodeModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition(
        'lru-memoizer',
        ['>=1.3 <4'],
        (moduleExports: LruMemoizerModule) => {
          // moduleExports is a function which receives an options object,
          // and returns a "memoizer" function upon invocation.
          // We want to patch this "memoizer's" internal function
          const asyncMemoizer = function (this: unknown, ...args: unknown[]): unknown {
            // This following function is invoked every time the user wants to get a (possible) memoized value
            // We replace it with another function in which we bind the current context to the last argument (callback)
            const origMemoizer = moduleExports.apply(this, args) as Memoizer;
            return function (this: unknown, ...memoizerArgs: unknown[]): unknown {
              // last argument is the callback
              const origCallback = memoizerArgs.pop();
              const callbackWithContext =
                typeof origCallback === 'function' ? context.bind(context.active(), origCallback) : origCallback;
              return origMemoizer.apply(this, [...memoizerArgs, callbackWithContext]);
            };
          };

          // sync function preserves context, but we still need to export it
          // as the lru-memoizer package does
          return Object.assign(asyncMemoizer, { sync: moduleExports.sync });
        },
        undefined, // no need to disable as this instrumentation does not create any spans
      ),
    ];
  }
}
