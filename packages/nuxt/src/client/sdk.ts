import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as initBrowser } from '@sentry/browser';
import { URL_FULL } from '@sentry/conventions/attributes';
import { HTTP_CLIENT } from '@sentry/conventions/op';
import type { Client } from '@sentry/core';
import { applySdkMetadata, DEFAULT_ENVIRONMENT, DEV_ENVIRONMENT } from '@sentry/core';
import { getNuxtBuildAssetsDir } from '../common/buildAssets';
import { applyNuxtTunnelBasePath } from '../common/tunnel';
import type { SentryNuxtClientOptions } from '../common/types';

/**
 * Initializes the client-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtClientOptions): Client | undefined {
  const envFallback = import.meta.dev ? DEV_ENVIRONMENT : DEFAULT_ENVIRONMENT;
  const sentryOptions = {
    /* BrowserTracing is added later with the Nuxt client plugin */
    defaultIntegrations: [...getBrowserDefaultIntegrations(options)],
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT ?? envFallback,
    ...options,
    ignoreSpans: [...(options.ignoreSpans || []), ...getBuildManifestRequestFilters()],
  };

  applyNuxtTunnelBasePath(sentryOptions);
  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'vue']);

  return initBrowser(sentryOptions);
}

/** Nuxt fetches its build manifest after hydration and polls for new builds. These requests would prolong pageloads. */
function getBuildManifestRequestFilters(): NonNullable<SentryNuxtClientOptions['ignoreSpans']> {
  const buildAssetsDir = getNuxtBuildAssetsDir();
  return buildAssetsDir
    ? // oxlint-disable-next-line sdk/no-unfiltered-url-attributes -- `ignoreSpans` match pattern, not a collected URL
      [{ op: HTTP_CLIENT, attributes: { [URL_FULL]: `${buildAssetsDir}builds/` } }]
    : [];
}
