import { addEventProcessor, addTracingExtensions, applySdkMetadata, getClient, setTag } from '@sentry/core';
import type { NodeOptions } from '@sentry/node-experimental';
import {
  Integrations as OriginalIntegrations,
  getDefaultIntegrations,
  init as nodeInit,
} from '@sentry/node-experimental';
import type { EventProcessor } from '@sentry/types';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { isBuild } from '../common/utils/isBuild';
import { distDirRewriteFramesIntegration } from './distDirRewriteFramesIntegration';
import { httpIntegration } from './httpIntegration';
import { onUncaughtExceptionIntegration } from './onUncaughtExceptionIntegration';

export * from '@sentry/node-experimental';
export { captureUnderscoreErrorException } from '../common/_error';

export const Integrations = {
  ...OriginalIntegrations,
};

const globalWithInjectedValues = global as typeof global & {
  __rewriteFramesDistDir__?: string;
};

/**
 * A passthrough error boundary for the server that doesn't depend on any react. Error boundaries don't catch SSR errors
 * so they should simply be a passthrough.
 */
export const ErrorBoundary = (props: React.PropsWithChildren<unknown>): React.ReactNode => {
  if (!props.children) {
    return null;
  }

  if (typeof props.children === 'function') {
    return (props.children as () => React.ReactNode)();
  }

  // since Next.js >= 10 requires React ^16.6.0 we are allowed to return children like this here
  return props.children as React.ReactNode;
};

/**
 * A passthrough redux enhancer for the server that doesn't depend on anything from the `@sentry/react` package.
 */
export function createReduxEnhancer() {
  return (createStore: unknown) => createStore;
}

/**
 * A passthrough error boundary wrapper for the server that doesn't depend on any react. Error boundaries don't catch
 * SSR errors so they should simply be a passthrough.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorBoundary<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
): React.FC<P> {
  return WrappedComponent as React.FC<P>;
}

/**
 * Just a passthrough since we're on the server and showing the report dialog on the server doesn't make any sense.
 */
export function showReportDialog(): void {
  return;
}

const IS_VERCEL = !!process.env.VERCEL;

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NodeOptions): void {
  addTracingExtensions();

  if (isBuild()) {
    return;
  }

  const customDefaultIntegrations = [
    ...getDefaultIntegrations(options).filter(
      integration => !['Http', 'OnUncaughtException'].includes(integration.name),
    ),
    httpIntegration(),
    onUncaughtExceptionIntegration(),
  ];

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const distDirName = globalWithInjectedValues.__rewriteFramesDistDir__;
  if (distDirName) {
    customDefaultIntegrations.push(distDirRewriteFramesIntegration({ distDirName }));
  }

  const opts = {
    environment: process.env.SENTRY_ENVIRONMENT || getVercelEnv(false) || process.env.NODE_ENV,
    defaultIntegrations: customDefaultIntegrations,
    ...options,
    // Right now we only capture frontend sessions for Next.js
    autoSessionTracking: false,
  };

  if (DEBUG_BUILD && opts.debug) {
    logger.enable();
  }

  DEBUG_BUILD && logger.log('Initializing SDK...');

  if (sdkAlreadyInitialized()) {
    DEBUG_BUILD && logger.log('SDK already initialized');
    return;
  }

  applySdkMetadata(opts, 'nextjs', ['nextjs', 'node']);

  nodeInit(opts);

  const filterTransactions: EventProcessor = event => {
    return event.type === 'transaction' && event.transaction === '/404' ? null : event;
  };

  filterTransactions.id = 'NextServer404TransactionFilter';

  setTag('runtime', 'node');
  if (IS_VERCEL) {
    setTag('vercel', true);
  }

  addEventProcessor(filterTransactions);

  if (process.env.NODE_ENV === 'development') {
    addEventProcessor(devErrorSymbolicationEventProcessor);
  }

  DEBUG_BUILD && logger.log('SDK successfully initialized');
}

function sdkAlreadyInitialized(): boolean {
  return !!getClient();
}

export * from '../common';

export { wrapApiHandlerWithSentry } from '../common/wrapApiHandlerWithSentry';
