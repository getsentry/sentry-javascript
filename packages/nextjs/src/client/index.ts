import { RewriteFrames } from '@sentry/integrations';
import { configureScope, init as reactInit, Integrations } from '@sentry/react';
import { BrowserTracing, defaultRequestInstrumentationOptions, hasTracingEnabled } from '@sentry/tracing';
import { EventProcessor } from '@sentry/types';

import { nextRouterInstrumentation } from './performance/client';
import { buildMetadata } from './utils/metadata';
import { NextjsOptions } from './utils/nextjsOptions';
import { applyTunnelRouteOption } from './utils/tunnelRoute';
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

const globalWithInjectedValues = global as typeof global & {
  __rewriteFramesAssetPrefixPath__: string;
};

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: NextjsOptions): void {
  applyTunnelRouteOption(options);
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
