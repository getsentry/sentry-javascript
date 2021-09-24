import { RewriteFrames } from '@sentry/integrations';
import { configureScope, getCurrentHub, init as nodeInit, Integrations } from '@sentry/node';
import { logger } from '@sentry/utils';

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
  if (options.debug) {
    logger.enable();
  }

  logger.log('Initializing SDK...');

  if (sdkAlreadyInitialized()) {
    logger.log('SDK already initialized');
    return;
  }

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

  logger.log('SDK successfully initialized');
}

function sdkAlreadyInitialized(): boolean {
  const hub = getCurrentHub();
  return !!hub.getClient();
}

/**
 * WARNING: don't refactor this variable.
 * This variable gets overridden at build time to set the correct path -- what users
 * defined in the `distDir` option in their Next.js configuration.
 */
export const PROJECT_BASEPATH = '.next';
const projectBasepathRegex = PROJECT_BASEPATH[0] === '.' ? `\\${PROJECT_BASEPATH}` : PROJECT_BASEPATH;
const sourcemapFilenameRegex = new RegExp(`^.*/${projectBasepathRegex}/`);

const defaultRewriteFramesIntegration = new RewriteFrames({
  iteratee: frame => {
    frame.filename = frame.filename?.replace(sourcemapFilenameRegex, 'app:///_next/');
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
export { withSentry } from './utils/withSentry';

// wrap various server methods to enable error monitoring and tracing
instrumentServer();
