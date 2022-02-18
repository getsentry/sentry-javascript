import { Carrier, getHubFromCarrier, getMainCarrier } from '@sentry/hub';
import { RewriteFrames } from '@sentry/integrations';
import { configureScope, getCurrentHub, init as nodeInit, Integrations } from '@sentry/node';
import { hasTracingEnabled } from '@sentry/tracing';
import { Event } from '@sentry/types';
import { escapeStringForRegex, logger } from '@sentry/utils';
import * as domainModule from 'domain';
import * as path from 'path';

import { buildMetadata } from './utils/metadata';
import { NextjsOptions } from './utils/nextjsOptions';
import { addIntegration } from './utils/userIntegrations';

export * from '@sentry/node';

// Here we want to make sure to only include what doesn't have browser specifics
// because or SSR of next.js we can only use this.
export { ErrorBoundary, withErrorBoundary } from '@sentry/react';

type GlobalWithDistDir = typeof global & { __rewriteFramesDistDir__: string };
const domain = domainModule as typeof domainModule & { active: (domainModule.Domain & Carrier) | null };

// During build, the main process is invoked by
//   `node next build`
// and child processes are invoked as
//   `node <path>/node_modules/.../jest-worker/processChild.js`.
// The former is (obviously) easy to recognize, but the latter could happen at runtime as well. Fortunately, the main
// process hits this file before any of the child processes do, so we're able to set an env variable which the child
// processes can then check. During runtime, the main process is invoked as
//   `node next start`
// or
//   `node /var/runtime/index.js`,
// so we never drop into the `if` in the first place.
let isBuild = false;
if (process.argv.includes('build') || process.env.SENTRY_BUILD_PHASE) {
  process.env.SENTRY_BUILD_PHASE = 'true';
  isBuild = true;
}

const isVercel = !!process.env.VERCEL;

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

  configureScope(scope => {
    scope.setTag('runtime', 'node');
    if (isVercel) {
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

  if (hasTracingEnabled(options)) {
    const defaultHttpTracingIntegration = new Integrations.Http({ tracing: true });
    options.integrations = addIntegration(defaultHttpTracingIntegration, options.integrations, {
      Http: { keyPath: '_tracing', value: true },
    });
  }
}

function filterTransactions(event: Event): Event | null {
  return event.type === 'transaction' && event.transaction === '/404' ? null : event;
}

export { withSentryConfig } from './config';
export { SentryWebpackPluginOptions } from './config/types';
export { withSentry } from './utils/withSentry';

// Wrap various server methods to enable error monitoring and tracing. (Note: This only happens for non-Vercel
// deployments, because the current method of doing the wrapping a) crashes Next 12 apps deployed to Vercel and
// b) doesn't work on those apps anyway. We also don't do it during build, because there's no server running in that
// phase.)
if (!isVercel && !isBuild) {
  // Dynamically require the file because even importing from it causes Next 12 to crash on Vercel.
  // In environments where the JS file doesn't exist, such as testing, import the TS file.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { instrumentServer } = require('./utils/instrumentServer.js');
    instrumentServer();
  } catch (err) {
    logger.warn(`Error: Unable to instrument server for tracing. Got ${err}.`);
  }
}
