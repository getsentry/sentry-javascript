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
 * - Vendored from: https://github.com/prisma/prisma/tree/b6feea5565ec577545a79547d24273ccdd11b4c7/packages/instrumentation-contract
 * - Upstream version: @prisma/instrumentation-contract@7.8.0
 * - Replaced `import packageJson from '../package.json'` with hardcoded major version
 */
/* eslint-disable */

import type { PrismaInstrumentationGlobalValue, TracingHelper } from './types';

const majorVersion = '7';

const GLOBAL_INSTRUMENTATION_KEY = 'PRISMA_INSTRUMENTATION';
const GLOBAL_VERSIONED_INSTRUMENTATION_KEY = `V${majorVersion}_PRISMA_INSTRUMENTATION` as const;

type GlobalThisWithPrismaInstrumentation = typeof globalThis & {
  [GLOBAL_INSTRUMENTATION_KEY]?: PrismaInstrumentationGlobalValue;
} & {
  [K in typeof GLOBAL_VERSIONED_INSTRUMENTATION_KEY]?: PrismaInstrumentationGlobalValue;
};

const globalThisWithPrismaInstrumentation = globalThis as GlobalThisWithPrismaInstrumentation;

export function getGlobalTracingHelper(): TracingHelper | undefined {
  const versionedGlobal = globalThisWithPrismaInstrumentation[GLOBAL_VERSIONED_INSTRUMENTATION_KEY];

  if (versionedGlobal?.helper) {
    return versionedGlobal.helper;
  }

  const fallbackGlobal = globalThisWithPrismaInstrumentation[GLOBAL_INSTRUMENTATION_KEY];

  return fallbackGlobal?.helper;
}

export function setGlobalTracingHelper(helper: TracingHelper): void {
  const globalValue: PrismaInstrumentationGlobalValue = { helper };

  globalThisWithPrismaInstrumentation[GLOBAL_VERSIONED_INSTRUMENTATION_KEY] = globalValue;
  globalThisWithPrismaInstrumentation[GLOBAL_INSTRUMENTATION_KEY] = globalValue;
}

export function clearGlobalTracingHelper(): void {
  delete globalThisWithPrismaInstrumentation[GLOBAL_VERSIONED_INSTRUMENTATION_KEY];
  delete globalThisWithPrismaInstrumentation[GLOBAL_INSTRUMENTATION_KEY];
}
