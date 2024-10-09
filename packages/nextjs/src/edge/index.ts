import { context } from '@opentelemetry/api';
import {
  applySdkMetadata,
  getCapturedScopesOnSpan,
  getCurrentScope,
  getIsolationScope,
  getRootSpan,
  registerSpanErrorInstrumentation,
  setCapturedScopesOnSpan,
} from '@sentry/core';

import { GLOBAL_OBJ } from '@sentry/utils';
import type { VercelEdgeOptions } from '@sentry/vercel-edge';
import { getDefaultIntegrations, init as vercelEdgeInit } from '@sentry/vercel-edge';

import { getScopesFromContext } from '@sentry/opentelemetry';
import { isBuild } from '../common/utils/isBuild';
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

  // Create/fork an isolation whenever we create root spans. This is ok because in Next.js we only create root spans on the edge for incoming requests.
  client?.on('spanStart', span => {
    if (span === getRootSpan(span)) {
      const scopes = getCapturedScopesOnSpan(span);

      const isolationScope = (scopes.isolationScope || getIsolationScope()).clone();
      const scope = scopes.scope || getCurrentScope();

      const currentScopesPointer = getScopesFromContext(context.active());
      if (currentScopesPointer) {
        currentScopesPointer.isolationScope = isolationScope;
      }

      setCapturedScopesOnSpan(span, scope, isolationScope);
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
