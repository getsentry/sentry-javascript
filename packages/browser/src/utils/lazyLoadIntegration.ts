import { SDK_VERSION, getClient } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import type { BrowserClient } from '../client';
import { WINDOW } from '../helpers';

// This is a map of integration function method to bundle file name.
const LazyLoadableIntegrations = {
  replayIntegration: 'replay',
  replayCanvasIntegration: 'replay-canvas',
  feedbackIntegration: 'feedback',
  feedbackModalIntegration: 'feedback-modal',
  feedbackScreenshotIntegration: 'feedback-screenshot',
  captureConsoleIntegration: 'captureconsole',
  contextLinesIntegration: 'contextlines',
  linkedErrorsIntegration: 'linkederrors',
  debugIntegration: 'debug',
  dedupeIntegration: 'dedupe',
  extraErrorDataIntegration: 'extraerrordata',
  httpClientIntegration: 'httpclient',
  reportingObserverIntegration: 'reportingobserver',
  rewriteFramesIntegration: 'rewriteframes',
  sessionTimingIntegration: 'sessiontiming',
  browserProfilingIntegration: 'browserprofiling',
  moduleMetadataIntegration: 'modulemetadata',
} as const;

const WindowWithMaybeIntegration = WINDOW as {
  Sentry?: Partial<Record<keyof typeof LazyLoadableIntegrations, IntegrationFn>>;
};

/**
 * Lazy load an integration from the CDN.
 * Rejects if the integration cannot be loaded.
 */
export async function lazyLoadIntegration(
  name: keyof typeof LazyLoadableIntegrations,
  scriptNonce?: string,
): Promise<IntegrationFn> {
  const bundle = LazyLoadableIntegrations[name];

  // `window.Sentry` is only set when using a CDN bundle, but this method can also be used via the NPM package
  const sentryOnWindow = (WindowWithMaybeIntegration.Sentry = WindowWithMaybeIntegration.Sentry || {});

  if (!bundle) {
    throw new Error(`Cannot lazy load integration: ${name}`);
  }

  // Bail if the integration already exists
  const existing = sentryOnWindow[name];
  // The `feedbackIntegration` is loaded by default in the CDN bundles,
  // so we need to differentiate between the real integration and the shim.
  // if only the shim exists, we still want to lazy load the real integration.
  if (typeof existing === 'function' && !('_isShim' in existing)) {
    return existing;
  }

  const url = getScriptURL(bundle);
  const script = WINDOW.document.createElement('script');
  script.src = url;
  script.crossOrigin = 'anonymous';
  script.referrerPolicy = 'origin';

  if (scriptNonce) {
    script.setAttribute('nonce', scriptNonce);
  }

  const waitForLoad = new Promise<void>((resolve, reject) => {
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', reject);
  });

  const currentScript = WINDOW.document.currentScript;
  const parent = WINDOW.document.body || WINDOW.document.head || (currentScript && currentScript.parentElement);

  if (parent) {
    parent.appendChild(script);
  } else {
    throw new Error(`Could not find parent element to insert lazy-loaded ${name} script`);
  }

  try {
    await waitForLoad;
  } catch {
    throw new Error(`Error when loading integration: ${name}`);
  }

  const integrationFn = sentryOnWindow[name];

  if (typeof integrationFn !== 'function') {
    throw new Error(`Could not load integration: ${name}`);
  }

  return integrationFn;
}

function getScriptURL(bundle: string): string {
  const client = getClient<BrowserClient>();
  const options = client && client.getOptions();
  const baseURL = (options && options.cdnBaseUrl) || 'https://browser.sentry-cdn.com';

  return new URL(`/${SDK_VERSION}/${bundle}.min.js`, baseURL).toString();
}
