import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Nest' integration is omitted from the default set.
const INTEGRATION_NAME = 'Nest';

// Span op/origin/attribute values inlined to match the vendored
// `@opentelemetry/instrumentation-nestjs-core` output exactly (the
// `@sentry/nestjs` e2e suite asserts these). They are NOT imported from
// `@sentry/nestjs` because that package depends on this one, not vice versa.
// Orchestrion's whole point is to keep this surface free of OTel.
const NESTJS_COMPONENT = '@nestjs/core';
const ORIGIN_NESTJS = 'auto.http.otel.nestjs';
const ATTR_COMPONENT = 'component';
const ATTR_NESTJS_TYPE = 'nestjs.type';
const ATTR_NESTJS_VERSION = 'nestjs.version';
const ATTR_NESTJS_MODULE = 'nestjs.module';
const TYPE_APP_CREATION = 'app_creation';

/**
 * The shape orchestrion's `tracePromise` transform attaches to the
 * tracing-channel context for `NestFactoryStatic.prototype.create`.
 * `arguments[0]` is the root application module class.
 */
interface NestFactoryCreateData {
  arguments: unknown[];
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

const _nestjsChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      DEBUG_BUILD && debug.log(`[orchestrion:nestjs] subscribing to channel "${CHANNELS.NESTJS_APP_CREATION}"`);

      // App-creation span: `bindTracingChannelToSpan` opens the span on
      // `start`, makes it the active context for the bootstrap, and ends
      // it on `asyncEnd` (or `end` if `create` throws synchronously).
      // `captureError: false`. Failed bootstrap surfaces to the caller.
      // We just annotate the span.
      bindTracingChannelToSpan(
        diagnosticsChannel.tracingChannel<NestFactoryCreateData>(CHANNELS.NESTJS_APP_CREATION),
        data => {
          const moduleCls = data.arguments?.[0] as { name?: string } | undefined;
          return startInactiveSpan({
            name: 'Create Nest App',
            op: `${TYPE_APP_CREATION}.nestjs`,
            attributes: {
              [ATTR_COMPONENT]: NESTJS_COMPONENT,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN_NESTJS,
              [ATTR_NESTJS_TYPE]: TYPE_APP_CREATION,
              ...(data.moduleVersion ? { [ATTR_NESTJS_VERSION]: data.moduleVersion } : {}),
              ...(moduleCls?.name ? { [ATTR_NESTJS_MODULE]: moduleCls.name } : {}),
            },
          });
        },
        { captureError: false },
      );
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL orchestrion-driven NestJS integration.
 *
 * Subscribes to the diagnostics_channels the orchestrion code transform
 * injects into `@nestjs/core` (see `orchestrion/config.ts`). Requires the
 * orchestrion runtime hook or bundler plugin to be active.
 */
export const nestjsChannelIntegration = defineIntegration(_nestjsChannelIntegration);
