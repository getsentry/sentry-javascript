import type { Carrier } from '@sentry/core';
import { getHubFromCarrier, getMainCarrier } from '@sentry/core';
import { RewriteFrames } from '@sentry/integrations';
import type { NodeOptions } from '@sentry/node';
import { configureScope, getCurrentHub, init as nodeInit, Integrations } from '@sentry/node';
import { hasTracingEnabled } from '@sentry/tracing';
import type { EventProcessor } from '@sentry/types';
import { escapeStringForRegex, logger } from '@sentry/utils';
import * as domainModule from 'domain';
import * as path from 'path';

import { buildMetadata } from '../common/metadata';
import type { IntegrationWithExclusionOption } from '../common/userIntegrations';
import { addOrUpdateIntegration } from '../common/userIntegrations';
import { isBuild } from './utils/isBuild';

export * from '@sentry/node';
export { captureUnderscoreErrorException } from '../common/_error';

// Here we want to make sure to only include what doesn't have browser specifics
// because or SSR of next.js we can only use this.
export { ErrorBoundary, showReportDialog, withErrorBoundary } from '@sentry/react';

const globalWithInjectedValues = global as typeof global & {
  __rewriteFramesDistDir__: string;
};

const domain = domainModule as typeof domainModule & { active: (domainModule.Domain & Carrier) | null };

// TODO (v8): Remove this
/**
 * @deprecated This constant will be removed in the next major update.
 */
export const IS_BUILD = isBuild();

const IS_VERCEL = !!process.env.VERCEL;

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NodeOptions): void {
  if (__DEBUG_BUILD__ && options.debug) {
    logger.enable();
  }

  __DEBUG_BUILD__ && logger.log('Initializing SDK...');

  if (sdkAlreadyInitialized()) {
    __DEBUG_BUILD__ && logger.log('SDK already initialized');
    return;
  }

  buildMetadata(options, ['nextjs', 'node']);
  options.environment = options.environment || process.env.NODE_ENV;
  addServerIntegrations(options);
  // Right now we only capture frontend sessions for Next.js
  options.autoSessionTracking = false;

  // In an ideal world, this init function would be called before any requests are handled. That way, every domain we
  // use to wrap a request would inherit its scope and client from the global hub. In practice, however, handling the
  // first request is what causes us to initialize the SDK, as the init code is injected into `_app` and all API route
  // handlers, and those are only accessed in the course of handling a request. As a result, we're already in a domain
  // when `init` is called. In order to compensate for this and mimic the ideal world scenario, we stash the active
  // domain, run `init` as normal, and then restore the domain afterwards, copying over data from the main hub as if we
  // really were inheriting.
  const activeDomain = domain.active;
  domain.active = null;

  nodeInit(options);

  const filterTransactions: EventProcessor = event => {
    return event.type === 'transaction' && event.transaction === '/404' ? null : event;
  };

  filterTransactions.id = 'NextServer404TransactionFilter';

  configureScope(scope => {
    scope.setTag('runtime', 'node');
    if (IS_VERCEL) {
      scope.setTag('vercel', true);
    }

    scope.addEventProcessor(filterTransactions);
  });

  if (activeDomain) {
    const globalHub = getHubFromCarrier(getMainCarrier());
    const domainHub = getHubFromCarrier(activeDomain);

    // apply the changes made by `nodeInit` to the domain's hub also
    domainHub.bindClient(globalHub.getClient());
    domainHub.getScope()?.update(globalHub.getScope());
    // `scope.update()` doesn’t copy over event processors, so we have to add it manually
    domainHub.getScope()?.addEventProcessor(filterTransactions);

    // restore the domain hub as the current one
    domain.active = activeDomain;
  }

  __DEBUG_BUILD__ && logger.log('SDK successfully initialized');
}

function sdkAlreadyInitialized(): boolean {
  const hub = getCurrentHub();
  return !!hub.getClient();
}

function addServerIntegrations(options: NodeOptions): void {
  let integrations = options.integrations || [];

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const distDirName = globalWithInjectedValues.__rewriteFramesDistDir__ || '.next';
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
  integrations = addOrUpdateIntegration(defaultRewriteFramesIntegration, integrations);

  const defaultOnUncaughtExceptionIntegration: IntegrationWithExclusionOption = new Integrations.OnUncaughtException({
    exitEvenIfOtherHandlersAreRegistered: false,
  });
  defaultOnUncaughtExceptionIntegration.allowExclusionByUser = true;
  integrations = addOrUpdateIntegration(defaultOnUncaughtExceptionIntegration, integrations, {
    _options: { exitEvenIfOtherHandlersAreRegistered: false },
  });

  if (hasTracingEnabled(options)) {
    const defaultHttpTracingIntegration = new Integrations.Http({ tracing: true });
    integrations = addOrUpdateIntegration(defaultHttpTracingIntegration, integrations, {
      _tracing: {},
    });
  }

  options.integrations = integrations;
}

// TODO (v8): Remove this
/**
 * @deprecated This constant will be removed in the next major update.
 */
const deprecatedIsBuild = (): boolean => isBuild();
// eslint-disable-next-line deprecation/deprecation
export { deprecatedIsBuild as isBuild };

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryGetStaticProps,
  wrapGetStaticPropsWithSentry,
} from './wrapGetStaticPropsWithSentry';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryServerSideGetInitialProps,
  wrapGetInitialPropsWithSentry,
} from './wrapGetInitialPropsWithSentry';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryServerSideAppGetInitialProps,
  wrapAppGetInitialPropsWithSentry,
} from './wrapAppGetInitialPropsWithSentry';
export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryServerSideDocumentGetInitialProps,
  wrapDocumentGetInitialPropsWithSentry,
} from './wrapDocumentGetInitialPropsWithSentry';
export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryServerSideErrorGetInitialProps,
  wrapErrorGetInitialPropsWithSentry,
} from './wrapErrorGetInitialPropsWithSentry';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryGetServerSideProps,
  wrapGetServerSidePropsWithSentry,
} from './wrapGetServerSidePropsWithSentry';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentry,
  // eslint-disable-next-line deprecation/deprecation
  withSentryAPI,
  wrapApiHandlerWithSentry,
} from './wrapApiHandlerWithSentry';

export { wrapAppDirComponentWithSentry } from './wrapAppDirComponentWithSentry';
