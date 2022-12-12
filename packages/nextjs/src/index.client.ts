import { RewriteFrames } from '@sentry/integrations';
import { configureScope, init as reactInit, Integrations } from '@sentry/react';
import { BrowserTracing, defaultRequestInstrumentationOptions, hasTracingEnabled } from '@sentry/tracing';
import { EventProcessor } from '@sentry/types';
import { dsnFromString, logger } from '@sentry/utils';

import { nextRouterInstrumentation } from './performance/client';
import { buildMetadata } from './utils/metadata';
import { NextjsOptions } from './utils/nextjsOptions';
import { addOrUpdateIntegration } from './utils/userIntegrations';

export * from '@sentry/react';
export { nextRouterInstrumentation } from './performance/client';
export { captureUnderscoreErrorException } from './utils/_error';

export { Integrations };

// Previously we expected users to import `BrowserTracing` like this:
//
// import { Integrations } from '@sentry/nextjs';
// const instance = new Integrations.BrowserTracing();
//
// This makes the integrations unable to be treeshaken though. To address this, we now have
// this individual export. We now expect users to consume BrowserTracing like so:
//
// import { BrowserTracing } from '@sentry/nextjs';
// const instance = new BrowserTracing();
export { BrowserTracing };

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

// This is a variable that Next.js will string replace during build with a string if run in an edge runtime from Next.js
// v12.2.1-canary.3 onwards:
// https://github.com/vercel/next.js/blob/166e5fb9b92f64c4b5d1f6560a05e2b9778c16fb/packages/next/build/webpack-config.ts#L206
declare const EdgeRuntime: string | undefined;
const globalWithInjectedValues = global as typeof global & {
  __rewriteFramesAssetPrefixPath__: string;
  __sentryRewritesTunnelPath__?: string;
};

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  if (typeof EdgeRuntime === 'string') {
    // If the SDK is imported when using the Vercel Edge Runtime, it will import the browser SDK, even though it is
    // running the server part of a Next.js application. We can use the `EdgeRuntime` to check for that case and make
    // the init call a no-op. This will prevent the SDK from crashing on the Edge Runtime.
    __DEBUG_BUILD__ && logger.log('Vercel Edge Runtime detected. Will not initialize SDK.');
    return;
  }

  let tunnelPath: string | undefined;
  if (globalWithInjectedValues.__sentryRewritesTunnelPath__ && options.dsn) {
    const dsnComponents = dsnFromString(options.dsn);
    const sentrySaasDsnMatch = dsnComponents.host.match(/^o(\d+)\.ingest\.sentry\.io$/);
    if (sentrySaasDsnMatch) {
      const orgId = sentrySaasDsnMatch[1];
      tunnelPath = `${globalWithInjectedValues.__sentryRewritesTunnelPath__}?o=${orgId}&p=${dsnComponents.projectId}`;
      options.tunnel = tunnelPath;
      __DEBUG_BUILD__ && logger.info(`Tunneling events to "${tunnelPath}"`);
    } else {
      __DEBUG_BUILD__ && logger.warn('Provided DSN is not a Sentry SaaS DSN. Will not tunnel events.');
    }
  }

  buildMetadata(options, ['nextjs', 'react']);
  options.environment = options.environment || process.env.NODE_ENV;
  addClientIntegrations(options);

  reactInit(options);

  configureScope(scope => {
    scope.setTag('runtime', 'browser');
    const filterTransactions: EventProcessor = event =>
      event.type === 'transaction' && event.transaction === '/404' ? null : event;
    filterTransactions.id = 'NextClient404Filter';
    scope.addEventProcessor(filterTransactions);
  });
}

function addClientIntegrations(options: NextjsOptions): void {
  let integrations = options.integrations || [];

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const assetPrefixPath = globalWithInjectedValues.__rewriteFramesAssetPrefixPath__ || '';

  const defaultRewriteFramesIntegration = new RewriteFrames({
    // Turn `<origin>/<path>/_next/static/...` into `app:///_next/static/...`
    iteratee: frame => {
      try {
        const { origin } = new URL(frame.filename as string);
        frame.filename = frame.filename?.replace(origin, 'app://').replace(assetPrefixPath, '');
      } catch (err) {
        // Filename wasn't a properly formed URL, so there's nothing we can do
      }

      return frame;
    },
  });
  integrations = addOrUpdateIntegration(defaultRewriteFramesIntegration, integrations);

  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false", in which case everything inside
  // will get treeshaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (hasTracingEnabled(options)) {
      const defaultBrowserTracingIntegration = new BrowserTracing({
        // eslint-disable-next-line deprecation/deprecation
        tracingOrigins: [...defaultRequestInstrumentationOptions.tracingOrigins, /^(api\/)/],
        routingInstrumentation: nextRouterInstrumentation,
      });

      integrations = addOrUpdateIntegration(defaultBrowserTracingIntegration, integrations, {
        'options.routingInstrumentation': nextRouterInstrumentation,
      });
    }
  }

  options.integrations = integrations;
}
