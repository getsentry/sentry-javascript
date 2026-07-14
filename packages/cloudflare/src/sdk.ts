import type { Integration } from '@sentry/core';
import {
  consoleIntegration,
  conversationIdIntegration,
  debug,
  dedupeIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type { CloudflareClientOptions, CloudflareOptions } from './client';
import { CloudflareClient } from './client';
import { makeFlushLock } from './flush';
import { httpServerIntegration } from './integrations/httpServer';
import { fetchIntegration } from './integrations/fetch';
import { honoIntegration } from './integrations/hono';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';
import { makeCloudflareTransport } from './transport';
import { defaultStackParser } from './vendor/stacktrace';

/**
 * Exact copy of the function from `@sentry/server-utils/orchestrion`.
 * This is to avoid importing the orchestrion package directly into the cloudflare package.
 * TODO(v11): Use `@sentry/server-utils/orchestrion` once we move to `nodejs_compat` by default
 */
function getRegisteredChannelIntegrations(): Integration[] {
  const marker = globalThis.__SENTRY_ORCHESTRION__;
  const registered = marker?.integrations || [];
  const transformedModules = marker?.transformedModules;

  warnAboutFailedModules(marker?.failedModules);

  if (!transformedModules) {
    return registered.map(entry => entry.factory());
  }

  return registered
    .filter(entry => entry.modules.some(module => transformedModules.includes(module)))
    .map(entry => entry.factory());
}

// A failed transform means the package is in the bundle but its diagnostics
// channels are not, so its integration is filtered out and spans silently go
// missing. Surface why (the bundler plugin also warns at build time). The
// failed-modules list is fixed at build time, but `init()` runs once per
// request in a Cloudflare worker, so remember which packages we've already
// warned about and warn once per isolate instead of on every request.
const warnedFailedModules = new Set<string>();

function warnAboutFailedModules(failedModules: string[] | undefined): void {
  if (!DEBUG_BUILD || !failedModules?.length) return;

  const unwarned = failedModules.filter(module => !warnedFailedModules.has(module));
  if (!unwarned.length) return;

  unwarned.forEach(module => warnedFailedModules.add(module));
  debug.warn(
    `[Sentry] The orchestrion code transform failed at build time for: ${unwarned.join(', ')}. ` +
      'No spans will be recorded for these packages.',
  );
}

/** Get the default integrations for the Cloudflare SDK. */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  // TODO(v11): Drop this transitional gating and let `requestDataIntegration` rely on the resolved
  // `dataCollection` defaults directly. Until then, preserve the historical Cloudflare behavior of not
  // attaching cookies unless the user explicitly opts in via `sendDefaultPii` or `dataCollection.cookies`.
  // eslint-disable-next-line typescript/no-deprecated
  const cookiesEnabled = options.sendDefaultPii || options.dataCollection?.cookies != null;
  return [
    // The Dedupe integration should not be used in workflows because we want to
    // capture all step failures, even if they are the same error.
    ...(options.enableDedupe === false ? [] : [dedupeIntegration()]),
    // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line typescript/no-deprecated
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    conversationIdIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
    // eslint-disable-next-line typescript/no-deprecated
    honoIntegration(),
    httpServerIntegration(),
    requestDataIntegration(cookiesEnabled ? undefined : { include: { cookies: false } }),
    consoleIntegration(),
    // The orchestrion diagnostics-channel subscribers (mysql, pg, …). The
    // `@sentry/cloudflare/vite` plugin injects the channels at build time and
    // adds a generated registration module to the bundle, which puts the
    // subscriber factories on the global marker. Read from there instead of
    // importing them so bundles built without the plugin — where the channels
    // would never fire — don't ship the code.
    ...getRegisteredChannelIntegrations(),
  ];
}

/**
 * Initializes the cloudflare SDK.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  const flushLock = options.ctx ? makeFlushLock(options.ctx) : undefined;
  delete options.ctx;

  const clientOptions: CloudflareClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeCloudflareTransport,
    flushLock,
  };

  /**
   * The Cloudflare SDK is not OpenTelemetry native, however, we set up some OpenTelemetry compatibility
   * via a custom trace provider.
   * This ensures that any spans emitted via `@opentelemetry/api` will be captured by Sentry.
   * HOWEVER, big caveat: This does not handle custom context handling, it will always work off the current scope.
   * This should be good enough for many, but not all integrations.
   */
  if (!options.skipOpenTelemetrySetup) {
    setupOpenTelemetryTracer();
  }

  return initAndBind(CloudflareClient, clientOptions) as CloudflareClient;
}
