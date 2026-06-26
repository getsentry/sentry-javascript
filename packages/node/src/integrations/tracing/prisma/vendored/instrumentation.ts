/*
 * Copyright Prisma
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/prisma/prisma/tree/b6feea5565ec577545a79547d24273ccdd11b4c7/packages/instrumentation
 * - Upstream version: @prisma/instrumentation@7.8.0
 * - Replaced `@prisma/instrumentation-contract` imports with local vendored equivalents
 * - Replaced `import { VERSION, NAME, MODULE_NAME } from './constants'` with local vendored constants
 * - Dropped the unused `setTracerProvider`/`tracerProvider` plumbing; the tracing helper creates spans
 *   through Sentry's span APIs, which resolve the active client themselves
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { ActiveTracingHelper } from './active-tracing-helper';
import { MODULE_NAME, NAME, SUPPORTED_MODULE_VERSIONS, VERSION } from './constants';
import { clearGlobalTracingHelper, getGlobalTracingHelper, setGlobalTracingHelper } from './global';

export interface PrismaInstrumentationConfig {
  ignoreSpanTypes?: (string | RegExp)[];
}

type Config = PrismaInstrumentationConfig & InstrumentationConfig;

export class PrismaInstrumentation extends InstrumentationBase {
  public constructor(config: Config = {}) {
    super(NAME, VERSION, config);
  }

  public init(): InstrumentationNodeModuleDefinition[] {
    const module = new InstrumentationNodeModuleDefinition(MODULE_NAME, SUPPORTED_MODULE_VERSIONS);

    return [module];
  }

  public enable(): void {
    const config = this._config as Config;

    setGlobalTracingHelper(
      new ActiveTracingHelper({
        ignoreSpanTypes: config.ignoreSpanTypes ?? [],
      }),
    );
  }

  public disable(): void {
    clearGlobalTracingHelper();
  }

  public isEnabled(): boolean {
    return getGlobalTracingHelper() !== undefined;
  }
}
