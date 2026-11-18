import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { BrowserOptions } from '@sentry/solid';
import { RELEASE_META_TAG_NAME } from '../common/release';
import { applyTunnelBasePath } from '../common/tunnel';
import {
  browserTracingIntegration,
  getDefaultIntegrations as getDefaultSolidIntegrations,
  init as initSolidSDK,
  WINDOW,
} from '@sentry/solid';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 * Initializes the client side of the Solid Start SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  const releaseFromPage = opts.release === undefined ? getReleaseFromMetaTag() : undefined;
  if (releaseFromPage) {
    opts.release = releaseFromPage;
  }

  applyTunnelBasePath(opts);
  applySdkMetadata(opts, 'solidstart', ['solidstart', 'solid']);

  return initSolidSDK(opts);
}

/**
 * The Sentry SolidStart build plugins add this tag to the page, instead of writing the release into the client
 * chunks where it would change their content hashes on every release.
 */
function getReleaseFromMetaTag(): string | undefined {
  return WINDOW.document?.querySelector<HTMLMetaElement>(`meta[name="${RELEASE_META_TAG_NAME}"]`)?.content || undefined;
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  const integrations = getDefaultSolidIntegrations(options);

  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get tree-shaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    // We add the default BrowserTracingIntegration here always.
    // We can do this, even if `solidRouterBrowserTracingIntegration` is
    // supplied as integration in `init` by users because it will win
    // over the default integration by virtue of having the same
    // `BrowserTracing` integration name and being added later.
    integrations.push(browserTracingIntegration());
  }

  return integrations;
}
