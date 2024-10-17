import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  applySdkMetadata,
  getRootSpan,
  registerSpanErrorInstrumentation,
  spanToJSON,
} from '@sentry/core';

import { GLOBAL_OBJ, vercelWaitUntil } from '@sentry/utils';
import type { VercelEdgeOptions } from '@sentry/vercel-edge';
import { getDefaultIntegrations, init as vercelEdgeInit } from '@sentry/vercel-edge';

import { isBuild } from '../common/utils/isBuild';
import { flushSafelyWithTimeout } from '../common/utils/responseEnd';
import { distDirRewriteFramesIntegration } from './distDirRewriteFramesIntegration';

export { captureUnderscoreErrorException } from '../common/pages-router-instrumentation/_error';

export type EdgeOptions = VercelEdgeOptions;

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __rewriteFramesDistDir__?: string;
};

/** Inits the Sentry NextJS SDK on the Edge Runtime. */
export function init(options: VercelEdgeOptions = {}): void {
  registerSpanErrorInstrumentation();

  if (isBuild()) {
    return;
  }

  const customDefaultIntegrations = getDefaultIntegrations(options);

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const distDirName = globalWithInjectedValues.__rewriteFramesDistDir__;

  if (distDirName) {
    customDefaultIntegrations.push(distDirRewriteFramesIntegration({ distDirName }));
  }

  const opts = {
    defaultIntegrations: customDefaultIntegrations,
    ...options,
  };

  applySdkMetadata(opts, 'nextjs');

  const client = vercelEdgeInit(opts);

  client?.on('spanStart', span => {
    const spanAttributes = spanToJSON(span).data;

    // Make sure middleware spans get the right op
    if (spanAttributes?.['next.span_type'] === 'Middleware.execute') {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'http.server.middleware');
    }
  });

  client?.on('spanEnd', span => {
    if (span === getRootSpan(span)) {
      vercelWaitUntil(flushSafelyWithTimeout());
    }
  });
}

/**
 * Just a passthrough in case this is imported from the client.
 */
export function withSentryConfig<T>(exportedUserNextConfig: T): T {
  return exportedUserNextConfig;
}

export * from '@sentry/vercel-edge';

export * from '../common';

export { wrapApiHandlerWithSentry } from './wrapApiHandlerWithSentry';
