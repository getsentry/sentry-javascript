import { hasTracingEnabled } from '@sentry/core';
import { RewriteFrames } from '@sentry/integrations';
import type { BrowserOptions } from '@sentry/react';
import {
  BrowserTracing,
  configureScope,
  defaultRequestInstrumentationOptions,
  init as reactInit,
  Integrations,
} from '@sentry/react';
import type { EventProcessor } from '@sentry/types';
import { addOrUpdateIntegration } from '@sentry/utils';

import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { buildMetadata } from '../common/metadata';
import { RouteChangeError } from './integrations/routeChangeError';
import { nextRouterInstrumentation } from './routing/nextRoutingInstrumentation';
import { applyTunnelRouteOption } from './tunnelRoute';

export * from '@sentry/react';
export * from '../common';
export { captureUnderscoreErrorException } from '../common/_error';
export { nextRouterInstrumentation } from './routing/nextRoutingInstrumentation';
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

const globalWithInjectedValues = global as typeof global & {
  __rewriteFramesAssetPrefixPath__: string;
};

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: BrowserOptions): void {
  const opts = {
    environment: getVercelEnv(true) || process.env.NODE_ENV,
    ...options,
  };

  applyTunnelRouteOption(opts);
  buildMetadata(opts, ['nextjs', 'react']);

  addClientIntegrations(opts);

  reactInit(opts);

  configureScope(scope => {
    scope.setTag('runtime', 'browser');
    const filterTransactions: EventProcessor = event =>
      event.type === 'transaction' && event.transaction === '/404' ? null : event;
    filterTransactions.id = 'NextClient404Filter';
    scope.addEventProcessor(filterTransactions);

    if (process.env.NODE_ENV === 'development') {
      scope.addEventProcessor(devErrorSymbolicationEventProcessor);
    }
  });
}

function addClientIntegrations(options: BrowserOptions): void {
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

      // We need to URI-decode the filename because Next.js has wildcard routes like "/users/[id].js" which show up as "/users/%5id%5.js" in Error stacktraces.
      // The corresponding sources that Next.js generates have proper brackets so we also need proper brackets in the frame so that source map resolving works.
      if (frame.filename && frame.filename.startsWith('app:///_next')) {
        frame.filename = decodeURI(frame.filename);
      }

      if (
        frame.filename &&
        frame.filename.match(
          /^app:\/\/\/_next\/static\/chunks\/(main-|main-app-|polyfills-|webpack-|framework-|framework\.)[0-9a-f]+\.js$/,
        )
      ) {
        // We don't care about these frames. It's Next.js internal code.
        frame.in_app = false;
      }

      return frame;
    },
  });
  integrations = addOrUpdateIntegration(defaultRewriteFramesIntegration, integrations);

  const defaultRouteChangeErrorIntegration = new RouteChangeError();
  integrations = addOrUpdateIntegration(defaultRouteChangeErrorIntegration, integrations);

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

/**
 * Just a passthrough in case this is imported from the client.
 */
export function withSentryConfig<T>(exportedUserNextConfig: T): T {
  return exportedUserNextConfig;
}
