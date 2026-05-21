/*
 * Copyright Prisma
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
 * - Vendored from: https://github.com/prisma/prisma/tree/b6feea5565ec577545a79547d24273ccdd11b4c7/packages/instrumentation
 * - Upstream version: @prisma/instrumentation@7.8.0
 * - Replaced `@prisma/instrumentation-contract` imports with local vendored equivalents
 * - Replaced `import { VERSION, NAME, MODULE_NAME } from './constants'` with local vendored constants
 */
/* eslint-disable */

import { trace, TracerProvider } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import { clearGlobalTracingHelper, getGlobalTracingHelper, setGlobalTracingHelper } from './global';

import { ActiveTracingHelper } from './active-tracing-helper';
import { MODULE_NAME, NAME, VERSION } from './constants';

export interface PrismaInstrumentationConfig {
  ignoreSpanTypes?: (string | RegExp)[];
}

type Config = PrismaInstrumentationConfig & InstrumentationConfig;

export class PrismaInstrumentation extends InstrumentationBase {
  private tracerProvider: TracerProvider | undefined;

  constructor(config: Config = {}) {
    super(NAME, VERSION, config);
  }

  setTracerProvider(tracerProvider: TracerProvider): void {
    this.tracerProvider = tracerProvider;
  }

  init() {
    const module = new InstrumentationNodeModuleDefinition(MODULE_NAME, [VERSION]);

    return [module];
  }

  enable() {
    const config = this._config as Config;

    setGlobalTracingHelper(
      new ActiveTracingHelper({
        tracerProvider: this.tracerProvider ?? trace.getTracerProvider(),
        ignoreSpanTypes: config.ignoreSpanTypes ?? [],
      }),
    );
  }

  disable() {
    clearGlobalTracingHelper();
  }

  isEnabled() {
    return getGlobalTracingHelper() !== undefined;
  }
}
