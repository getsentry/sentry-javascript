import type { BrowserOptions as ReactBrowserOptions } from '@sentry/react';
import { WINDOW } from '@sentry/react';
import { RELEASE_META_TAG_NAME } from '../common/release';

/**
 * Takes the release from the meta tag the server writes into each page, unless `Sentry.init()` sets one.
 */
export function applyReleaseFromMetaTag(options: ReactBrowserOptions): void {
  if (options.release !== undefined) {
    return;
  }

  const document = WINDOW.document as typeof WINDOW.document | undefined;
  const release = document?.querySelector(`meta[name="${RELEASE_META_TAG_NAME}"]`)?.getAttribute('content');
  if (release) {
    options.release = release;
  }
}
