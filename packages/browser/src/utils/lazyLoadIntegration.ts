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
} as const;

const WindowWithMaybeIntegration = WINDOW as {
  Sentry?: Partial<Record<keyof typeof LazyLoadableIntegrations, IntegrationFn>>;
};

/**
 * Lazy load an integration from the CDN.
 * Rejects if the integration cannot be loaded.
 */
export async function lazyLoadIntegration(name: keyof typeof LazyLoadableIntegrations): Promise<IntegrationFn> {
  const bundle = LazyLoadableIntegrations[name];

  if (!bundle || !WindowWithMaybeIntegration.Sentry) {
    throw new Error(`Cannot lazy load integration: ${name}`);
  }

  // Bail if the integration already exists
  const existing = WindowWithMaybeIntegration.Sentry[name];
  if (typeof existing === 'function') {
    return existing;
  }

  const url = getScriptURL(bundle);
  const script = WINDOW.document.createElement('script');
  script.src = url;
  script.crossOrigin = 'anonymous';

  const waitForLoad = new Promise<void>((resolve, reject) => {
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', reject);
  });

  WINDOW.document.body.appendChild(script);

  try {
    await waitForLoad;
  } catch {
    throw new Error(`Error when loading integration: ${name}`);
  }

  const integrationFn = WindowWithMaybeIntegration.Sentry[name];

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
