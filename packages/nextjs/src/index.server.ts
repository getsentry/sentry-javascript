import { RewriteFrames } from '@sentry/integrations';
import { configureScope, init as nodeInit, Integrations } from '@sentry/node';

import { instrumentServer } from './utils/instrumentServer';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';
import { addIntegration } from './utils/userIntegrations';

export * from '@sentry/node';

// Here we want to make sure to only include what doesn't have browser specifics
// because or SSR of next.js we can only use this.
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NextjsOptions): void {
  const metadataBuilder = new MetadataBuilder(options, ['nextjs', 'node']);
  metadataBuilder.addSdkMetadata();
  options.environment = options.environment || process.env.NODE_ENV;
  // TODO capture project root and store in an env var for RewriteFrames?
  addServerIntegrations(options);
  // Right now we only capture frontend sessions for Next.js
  options.autoSessionTracking = false;

  nodeInit(options);
  configureScope(scope => {
    scope.setTag('runtime', 'node');
  });
}

const SOURCEMAP_FILENAME_REGEX = /^.*\/\.next\//;

const defaultRewriteFramesIntegration = new RewriteFrames({
  iteratee: frame => {
    frame.filename = frame.filename?.replace(SOURCEMAP_FILENAME_REGEX, 'app:///_next/');
    return frame;
  },
});

const defaultHttpTracingIntegration = new Integrations.Http({ tracing: true });

function addServerIntegrations(options: NextjsOptions): void {
  if (options.integrations) {
    options.integrations = addIntegration(defaultRewriteFramesIntegration, options.integrations);
  } else {
    options.integrations = [defaultRewriteFramesIntegration];
  }

  if (options.tracesSampleRate !== undefined || options.tracesSampler !== undefined) {
    options.integrations = addIntegration(defaultHttpTracingIntegration, options.integrations, {
      Http: { keyPath: '_tracing', value: true },
    });
  }
}

export { withSentryConfig } from './config';
export { withSentry } from './utils/handlers';

// wrap various server methods to enable error monitoring and tracing
instrumentServer();
