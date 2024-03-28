import { SDK_VERSION } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { WINDOW } from '../helpers';

// This is a map of integration function method to bundle file name.
const LazyLoadableIntegrations = {
  replayIntegration: 'replay',
  replayCanvasIntegration: 'replay-canvas',
  feedbackIntegration: 'feedback',
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

const WindowWithMaybeIntegration = WINDOW as typeof WINDOW & {
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
  console.log({ existing });
  if (typeof existing === 'function') {
    return existing;
  }

  const url = `https://browser.sentry-cdn.com/${SDK_VERSION}/${bundle}.min.js`;

  const script = WINDOW.document.createElement('script');
  script.src = url;
  script.crossOrigin = 'anonymous';

  console.log(url);

  const waitForLoad = new Promise<void>((resolve, reject) => {
    script.addEventListener(
      'load',
      () => {
        console.log('LOADED!');
        resolve();
      },
      { once: true, passive: true },
    );
    script.addEventListener(
      'error',
      error => {
        console.error(error);
        reject(error);
      },
      { once: true, passive: true },
    );
  });

  WINDOW.document.body.appendChild(script);

  console.log(WINDOW.document.body.innerHTML);

  console.log('start waiting....');

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
