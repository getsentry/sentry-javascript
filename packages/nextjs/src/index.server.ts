import { RewriteFrames } from '@sentry/integrations';
import { configureScope, init as nodeInit } from '@sentry/node';

import { InitDecider } from './utils/initDecider';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';

export * from '@sentry/node';

// Here we want to make sure to only include what doesn't have browser specifics
// because or SSR of next.js we can only use this.
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';

const SOURCEMAP_FILENAME_REGEX = /^.*\/.next\//;

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NextjsOptions): void {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'node']);
  metadataBuilder.addSdkMetadata();
  const initDecider = new InitDecider(options);
  if (initDecider.shouldInitSentry()) {
    nodeInit({
      ...options,
      // TODO: handle use cases when users provide integrations
      integrations: [
        new RewriteFrames({
          iteratee: frame => {
            try {
              if (frame.filename) {
                frame.filename = frame.filename.replace(SOURCEMAP_FILENAME_REGEX, 'app:///_next/');
              }
            } catch {
              //
            }
            return frame;
          },
        }),
      ],
    });
    configureScope(scope => {
      scope.setTag('runtime', 'node');
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[Sentry] Detected a non-production environment. Not initializing Sentry.');
    // eslint-disable-next-line no-console
    console.warn('[Sentry] To use Sentry also in development set `dev: true` in the options.');
  }
}
