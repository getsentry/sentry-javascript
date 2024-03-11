import { addTracingExtensions, applySdkMetadata, getClient } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import {
  Integrations as OriginalIntegrations,
  getCurrentScope,
  getDefaultIntegrations,
  init as nodeInit,
} from '@sentry/node';
import type { EventProcessor } from '@sentry/types';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { isBuild } from '../common/utils/isBuild';
import { Http } from './httpIntegration';
import { OnUncaughtException } from './onUncaughtExceptionIntegration';
import { rewriteFramesIntegration } from './rewriteFramesIntegration';

export * from '@sentry/node';
export { captureUnderscoreErrorException } from '../common/_error';

export const Integrations = {
  ...OriginalIntegrations,
  Http,
  OnUncaughtException,
};

export { rewriteFramesIntegration };

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

// TODO (v8): Remove this
/**
 * @deprecated This constant will be removed in the next major update.
 */
export const IS_BUILD = isBuild();

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
    rewriteFramesIntegration(),
    new Http(),
    new OnUncaughtException(),
  ];

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

  const scope = getCurrentScope();
  scope.setTag('runtime', 'node');
  if (IS_VERCEL) {
    scope.setTag('vercel', true);
  }

  scope.addEventProcessor(filterTransactions);

  if (process.env.NODE_ENV === 'development') {
    scope.addEventProcessor(devErrorSymbolicationEventProcessor);
  }

  DEBUG_BUILD && logger.log('SDK successfully initialized');
}

function sdkAlreadyInitialized(): boolean {
  return !!getClient();
}

// TODO (v8): Remove this
/**
 * @deprecated This constant will be removed in the next major update.
 */
const deprecatedIsBuild = (): boolean => isBuild();
// eslint-disable-next-line deprecation/deprecation
export { deprecatedIsBuild as isBuild };

export * from '../common';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentry,
  // eslint-disable-next-line deprecation/deprecation
  withSentryAPI,
  wrapApiHandlerWithSentry,
} from '../common/wrapApiHandlerWithSentry';
