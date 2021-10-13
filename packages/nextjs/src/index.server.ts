import { RewriteFrames } from '@sentry/integrations';
import { configureScope, getCurrentHub, init as nodeInit, Integrations } from '@sentry/node';
import { escapeStringForRegex, logger } from '@sentry/utils';
import * as path from 'path';

import { instrumentServer } from './utils/instrumentServer';
import { MetadataBuilder } from './utils/metadataBuilder';
import { NextjsOptions } from './utils/nextjsOptions';
import { addIntegration } from './utils/userIntegrations';

export * from '@sentry/node';

// Here we want to make sure to only include what doesn't have browser specifics
// because or SSR of next.js we can only use this.
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';

type GlobalWithDistDir = typeof global & { __rewriteFramesDistDir__: string };

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

function addServerIntegrations(options: NextjsOptions): void {
  // This value is injected at build time, based on the output directory specified in the build config
  const distDirName = (global as GlobalWithDistDir).__rewriteFramesDistDir__ || '.next';
  // nextjs always puts the build directory at the project root level, which is also where you run `next start` from, so
  // we can read in the project directory from the currently running process
  const distDirAbsPath = path.resolve(process.cwd(), distDirName);
  const SOURCEMAP_FILENAME_REGEX = new RegExp(escapeStringForRegex(distDirAbsPath));

  const defaultRewriteFramesIntegration = new RewriteFrames({
    iteratee: frame => {
      frame.filename = frame.filename?.replace(SOURCEMAP_FILENAME_REGEX, 'app:///_next');
      return frame;
    },
  });

  if (options.integrations) {
    options.integrations = addIntegration(defaultRewriteFramesIntegration, options.integrations);
  } else {
    options.integrations = [defaultRewriteFramesIntegration];
  }

  if (options.tracesSampleRate !== undefined || options.tracesSampler !== undefined) {
    const defaultHttpTracingIntegration = new Integrations.Http({ tracing: true });
    options.integrations = addIntegration(defaultHttpTracingIntegration, options.integrations, {
      Http: { keyPath: '_tracing', value: true },
    });
  }
}

export { withSentryConfig } from './config';
export { withSentry } from './utils/withSentry';

// wrap various server methods to enable error monitoring and tracing
instrumentServer();
