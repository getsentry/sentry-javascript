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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-lru-memoizer
 * - Upstream version: @opentelemetry/instrumentation-lru-memoizer@0.62.0
 */
/* eslint-disable */

import { context } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';

const PACKAGE_NAME = '@sentry/instrumentation-lru-memoizer';

export class LruMemoizerInstrumentation extends InstrumentationBase {
  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  init(): InstrumentationNodeModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition(
        'lru-memoizer',
        ['>=1.3 <4'],
        moduleExports => {
          // moduleExports is a function which receives an options object,
          // and returns a "memoizer" function upon invocation.
          // We want to patch this "memoizer's" internal function
          const asyncMemoizer = function (this: unknown) {
            // This following function is invoked every time the user wants to get a (possible) memoized value
            // We replace it with another function in which we bind the current context to the last argument (callback)
            const origMemoizer = moduleExports.apply(this, arguments);
            return function (this: unknown) {
              const modifiedArguments = [...arguments];
              // last argument is the callback
              const origCallback = modifiedArguments.pop();
              const callbackWithContext =
                typeof origCallback === 'function' ? context.bind(context.active(), origCallback) : origCallback;
              modifiedArguments.push(callbackWithContext);
              return origMemoizer.apply(this, modifiedArguments);
            };
          };

          // sync function preserves context, but we still need to export it
          // as the lru-memoizer package does
          asyncMemoizer.sync = moduleExports.sync;
          return asyncMemoizer;
        },
        undefined, // no need to disable as this instrumentation does not create any spans
      ),
    ];
  }
}
