import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as initBrowser, WINDOW } from '@sentry/browser';
import { URL_FULL } from '@sentry/conventions/attributes';
import { HTTP_CLIENT } from '@sentry/conventions/op';
import type { Client } from '@sentry/core';
import {
  _INTERNAL_captureOptionsSetByUser,
  applySdkMetadata,
  DEFAULT_ENVIRONMENT,
  DEV_ENVIRONMENT,
  escapeStringForRegex,
} from '@sentry/core';
import { getNuxtPublicBuildAssetsUrl } from '../common/buildAssets';
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
    ..._INTERNAL_captureOptionsSetByUser(options),
    ignoreSpans: [...(options.ignoreSpans || []), ...getBuildManifestRequestFilters()],
  };

  applyNuxtTunnelBasePath(sentryOptions);
  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'vue']);

  return initBrowser(sentryOptions);
}

/**
 * Nuxt fetches its build manifest after hydration and polls for new builds. These requests would prolong pageloads.
 * `url.full` holds the URL as the app passed it at span start, and the resolved URL later.
 */
function getBuildManifestRequestFilters(): NonNullable<SentryNuxtClientOptions['ignoreSpans']> {
  const buildAssetsUrl = getNuxtPublicBuildAssetsUrl();
  if (!buildAssetsUrl) {
    return [];
  }

  const manifestUrl = `${buildAssetsUrl}builds/`;
  const urlPattern = [manifestUrl, resolveUrl(manifestUrl)].map(escapeStringForRegex).join('|');

  return [{ op: HTTP_CLIENT, attributes: { [URL_FULL]: new RegExp(`^(?:${urlPattern})`) } }];
}

function resolveUrl(url: string): string {
  try {
    return new URL(url, WINDOW.location.href).href;
  } catch {
    return url;
  }
}
