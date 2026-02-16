import type { Integration } from '@sentry/core';
import {
  consoleIntegration,
  conversationIdIntegration,
  dedupeIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import type { CloudflareClientOptions, CloudflareOptions } from './client';
import { CloudflareClient } from './client';
import { makeFlushLock } from './flush';
import { fetchIntegration } from './integrations/fetch';
import { honoIntegration } from './integrations/hono';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';
import { makeCloudflareTransport } from './transport';
import { defaultStackParser } from './vendor/stacktrace';

// Cache for default integrations to avoid recreating them on every request.
// Key is a string representation of options that affect integration creation.
// This significantly reduces memory allocation under high load.
let _cachedDefaultIntegrations: Integration[] | undefined;
let _cachedIntegrationKey: string | undefined;

/** Get the default integrations for the Cloudflare SDK. */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  const sendDefaultPii = options.sendDefaultPii ?? false;
  const enableDedupe = options.enableDedupe !== false;

  // Create a cache key based on options that affect integration creation
  const cacheKey = `${sendDefaultPii}:${enableDedupe}`;

  // Return cached integrations if the options match
  if (_cachedDefaultIntegrations && _cachedIntegrationKey === cacheKey) {
    return _cachedDefaultIntegrations;
  }

  const integrations = [
    // The Dedupe integration should not be used in workflows because we want to
    // capture all step failures, even if they are the same error.
    ...(enableDedupe ? [dedupeIntegration()] : []),
    // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    conversationIdIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
    honoIntegration(),
    // TODO(v11): the `include` object should be defined directly in the integration based on `sendDefaultPii`
    requestDataIntegration(sendDefaultPii ? undefined : { include: { cookies: false } }),
    consoleIntegration(),
  ];

  // Cache for subsequent requests
  _cachedDefaultIntegrations = integrations;
  _cachedIntegrationKey = cacheKey;

  return integrations;
}

// Cache for processed integrations and stack parser to avoid reprocessing on every request
let _cachedProcessedIntegrations: Integration[] | undefined;
let _cachedStackParser: ReturnType<typeof stackParserFromStackParserOptions> | undefined;
let _openTelemetryTracerSetup = false;

/**
 * Resets the SDK cache. This is primarily used for testing purposes.
 * @internal
 */
export function _INTERNAL_resetSdkCache(): void {
  _cachedDefaultIntegrations = undefined;
  _cachedIntegrationKey = undefined;
  _cachedProcessedIntegrations = undefined;
  _cachedStackParser = undefined;
  _openTelemetryTracerSetup = false;
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

  // Cache processed integrations - only recompute if user provides custom integrations
  if (!_cachedProcessedIntegrations && !options.integrations) {
    _cachedProcessedIntegrations = getIntegrationsToSetup(options);
  }

  // Cache stack parser
  if (!_cachedStackParser && !options.stackParser) {
    _cachedStackParser = stackParserFromStackParserOptions(defaultStackParser);
  }

  const clientOptions: CloudflareClientOptions = {
    ...options,
    stackParser: options.stackParser
      ? stackParserFromStackParserOptions(options.stackParser)
      : (_cachedStackParser as ReturnType<typeof stackParserFromStackParserOptions>),
    integrations: options.integrations ? getIntegrationsToSetup(options) : (_cachedProcessedIntegrations as Integration[]),
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
  if (!options.skipOpenTelemetrySetup && !_openTelemetryTracerSetup) {
    setupOpenTelemetryTracer();
    _openTelemetryTracerSetup = true;
  }

  return initAndBind(CloudflareClient, clientOptions) as CloudflareClient;
}
