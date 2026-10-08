// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
import type { Scope } from '@sentry/core';
import {
  _INTERNAL_getActiveClient,
  applySdkMetadata,
  debug,
  getGlobalScope,
  getVercelEnv,
  GLOBAL_OBJ,
} from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations, httpIntegration, init as nodeInit } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';
import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { dropReactControlFlowErrorsEventProcessor } from '../common/utils/dropReactControlFlowErrors';
import { isBuild } from '../common/utils/isBuild';
import {
  isAsyncContextOwnedByCloudflare,
  isAsyncContextOwnedByNextjsCloudflare,
  isCloudflareWaitUntilAvailable,
  setCloudflareWorkerRelease,
} from '../common/utils/responseEnd';
import { distDirRewriteFramesIntegration } from './distDirRewriteFramesIntegration';
import { registerNextSentryPropagator } from './nextSentryPropagator';
import { addNextjsServerSpanHooks, NEXTJS_SERVER_IGNORE_SPANS } from './serverSpanHooks';
import { prepareSafeIdGeneratorContext } from './prepareSafeIdGeneratorContext';
import { nextjsUseCacheIntegration } from './useCacheInstrumentation';

export * from '@sentry/node';

// Explicitly re-export so these are statically detectable by turbopack
export { pinoIntegration, vercelAIIntegration } from '@sentry/node';

export { captureUnderscoreErrorException } from '../common/pages-router-instrumentation/_error';

// Override core span methods with Next.js-specific implementations that support Cache Components
export { startSpan, startSpanManual, startInactiveSpan } from '../common/utils/nextSpan';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewriteFramesDistDir?: string;
  _sentryRelease?: string;
};

// Call at module level so `next build` prerender workers still register the runner without `init`
prepareSafeIdGeneratorContext();

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

/**
 * Returns the runtime configuration for the SDK based on the environment.
 * When running on OpenNext/Cloudflare, returns cloudflare runtime config.
 */
function getCloudflareRuntimeConfig(): { runtime: { name: string } } | undefined {
  if (isCloudflareWaitUntilAvailable()) {
    // todo: add version information?
    return { runtime: { name: 'cloudflare' } };
  }
  return undefined;
}

/** Inits the Sentry NextJS SDK on node. */
// eslint-disable-next-line complexity
export function init(options: NodeOptions): NodeClient | undefined {
  prepareSafeIdGeneratorContext();
  if (isBuild()) {
    return;
  }

  if (!DEBUG_BUILD && options.debug) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] You have enabled `debug: true`, but Sentry debug logging was removed from your bundle (likely via `webpack.treeshake.removeDebugLogging: true`). Set that option to `false` to see Sentry debug output.',
    );
  }

  const customDefaultIntegrations = getDefaultIntegrations(options)
    .filter(integration => integration.name !== 'Http')
    .concat(
      // We are using the HTTP integration without instrumenting incoming HTTP requests because Next.js does that by itself.
      httpIntegration({
        disableIncomingRequestSpans: true,
      }),
    );

  // Turn off Next.js' own fetch instrumentation (only when we manage OTEL)
  // https://github.com/lforst/nextjs-fork/blob/1994fd186defda77ad971c36dc3163db263c993f/packages/next/src/server/lib/patch-fetch.ts#L245
  // Enable with custom OTel setup: https://github.com/getsentry/sentry-javascript/issues/17581
  if (options.enableOpenTelemetrySetup ?? true) {
    process.env.NEXT_OTEL_FETCH_DISABLED = '1';
  }

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const distDirName = process.env._sentryRewriteFramesDistDir || globalWithInjectedValues._sentryRewriteFramesDistDir;
  if (distDirName) {
    customDefaultIntegrations.push(distDirRewriteFramesIntegration({ distDirName }));
  }

  customDefaultIntegrations.push(nextjsUseCacheIntegration());

  // Detect if running on OpenNext/Cloudflare and get runtime config
  const cloudflareConfig = getCloudflareRuntimeConfig();

  const opts: NodeOptions = {
    environment: options.environment || process.env.SENTRY_ENVIRONMENT || getVercelEnv() || process.env.NODE_ENV,
    release: process.env._sentryRelease || globalWithInjectedValues._sentryRelease,
    defaultIntegrations: customDefaultIntegrations,
    // Next.js emits its own OpenTelemetry spans, so it defaults to registering the Sentry tracer
    // provider (unlike most Node-based SDKs). A user-provided value still overrides this via `...options`.
    enableOpenTelemetrySetup: true,
    ...options,
    // Override runtime to 'cloudflare' when running on OpenNext/Cloudflare
    ...cloudflareConfig,
  };

  opts.ignoreSpans = [...(opts.ignoreSpans || []), ...NEXTJS_SERVER_IGNORE_SPANS];

  if (DEBUG_BUILD && opts.debug) {
    debug.enable();
  }

  DEBUG_BUILD && debug.log('Initializing SDK...');

  // The client of `withSentry` from `@sentry/cloudflare` handles this request, so `init` creates none. The global
  // parts below still apply.
  const isOwnedByCloudflare = isAsyncContextOwnedByCloudflare();
  const existingClient = _INTERNAL_getActiveClient<NodeClient>();
  if (existingClient && !isOwnedByCloudflare) {
    DEBUG_BUILD && debug.log('SDK already initialized');
    return existingClient;
  }

  // Use appropriate SDK metadata based on the runtime environment
  applySdkMetadata(opts, 'nextjs', ['nextjs', cloudflareConfig ? 'cloudflare' : 'node']);

  const client = isOwnedByCloudflare ? undefined : nodeInit(opts);

  if (client) {
    addNextjsServerSpanHooks(client);
  } else if (isOwnedByCloudflare) {
    setCloudflareWorkerRelease(opts.release);
  }

  // Next.js reads the trace meta tags of a document through the global propagator. Only the setup the
  // Node SDK owns gets the Next.js-aware one; another OpenTelemetry setup (for example `@vercel/otel`)
  // keeps its own tracer provider and propagator.
  if (client?.traceProvider) {
    registerNextSentryPropagator(client.traceProvider);
  }

  // On the client, not the global scope, so a later `init()` after
  // `close()` does not stack another copy. In a request of `withSentry` on
  // Workers, `init` creates no client, so the global scope gets them, which
  // reaches every client of `withSentry`, unless an earlier `init` added them.
  let eventProcessorTarget: NodeClient | Scope | undefined = client;
  if (isOwnedByCloudflare) {
    const globalScope = getGlobalScope();
    const isAdded = globalScope
      .getScopeData()
      .eventProcessors.some(processor => processor.id === 'DropReactControlFlowErrors');
    eventProcessorTarget = isAdded ? undefined : globalScope;
  }
  // Each client of `withSentry` from `@sentry/nextjs/cloudflare` gets the processor from its `Nextjs` integration.
  if (!isAsyncContextOwnedByNextjsCloudflare()) {
    eventProcessorTarget?.addEventProcessor(dropReactControlFlowErrorsEventProcessor);
  }

  if (process.env.NODE_ENV === 'development') {
    eventProcessorTarget?.addEventProcessor(devErrorSymbolicationEventProcessor);
  }

  try {
    // @ts-expect-error `process.turbopack` is a magic string that will be replaced by Next.js
    if (process.turbopack) {
      getGlobalScope().setTag('turbopack', true);
      getGlobalScope().setAttribute('turbopack', true);
    }
  } catch {
    // Noop
    // The statement above can throw because process is not defined on the client
  }

  if (isOwnedByCloudflare) {
    DEBUG_BUILD &&
      debug.log(
        'The client of `withSentry` handles this Worker, so `init` creates no client and only applies `release`. Set the other options in `withSentry`.',
      );
  } else {
    DEBUG_BUILD && debug.log('SDK successfully initialized');
  }

  return client;
}

export * from '../common';

export { wrapApiHandlerWithSentry } from '../common/pages-router-instrumentation/wrapApiHandlerWithSentry';
