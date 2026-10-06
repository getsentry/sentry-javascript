import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { prismaModuleNames } from '../../orchestrion/config/prisma';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { setGlobalTracingHelper } from './global';
import { instrumentPrismaV8 } from './orchestrion';
import { ActiveTracingHelper } from './tracing-helper';

const INTEGRATION_NAME = 'Prisma' as const;

export interface PrismaInstrumentationConfig {
  /**
   * Span types that should not be traced. Matched against the full span name (e.g. `prisma:client:operation`),
   * either exactly (string) or by pattern (RegExp).
   */
  ignoreSpanTypes?: (string | RegExp)[];
}

export interface PrismaOptions {
  /**
   * Configuration for the Prisma tracing helper.
   */
  instrumentationConfig?: PrismaInstrumentationConfig;
}

/**
 * Sets up the global Prisma tracing helper that Prisma looks up on `globalThis` to emit tracing data.
 *
 * Prisma reads `globalThis.PRISMA_INSTRUMENTATION` (and its versioned variant) to find a "TracingHelper"
 * which it uses internally to create spans, so it can produce tracing data without depending on
 * OpenTelemetry. The helper we install here mints spans through Sentry's span APIs. A single helper
 * serves both Prisma v5 (which calls `createEngineSpan`) and v6/v7 (which call `dispatchEngineSpans`),
 * so it doesn't blow up on version mismatches.
 */
export function instrumentPrisma(options?: PrismaOptions): void {
  setGlobalTracingHelper(
    new ActiveTracingHelper({
      ignoreSpanTypes: options?.instrumentationConfig?.ignoreSpanTypes ?? [],
    }),
  );
}

const _prismaIntegration = ((options?: PrismaOptions) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentPrisma(options);
    },
    // Prisma 8 has no tracing helper to install; its ORM terminals are instrumented via orchestrion instead.
    setup(client) {
      invokeOrchestrionInstrumentation(client, prismaModuleNames, instrumentPrismaV8, [
        { ignoreSpanTypes: options?.instrumentationConfig?.ignoreSpanTypes ?? [] },
      ]);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [prisma](https://www.npmjs.com/package/prisma) library.
 * For more information, see the [`prismaIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/prisma/).
 *
 * NOTE: This integration works out of the box with Prisma v6, v7 and v8. Prisma v8 ("Prisma Next")
 * has no tracing surface of its own, so its ORM calls are instrumented through Sentry's runtime hook
 * or bundler plugin, like the other channel-based integrations.
 * On Prisma versions prior to v6, add `previewFeatures = ["tracing"]` to the client generator block of your Prisma schema:
 *
 *    ```
 *    generator client {
 *      provider = "prisma-client-js"
 *      previewFeatures = ["tracing"]
 *    }
 *    ```
 */
export const prismaIntegration = defineIntegration(_prismaIntegration);
