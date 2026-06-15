import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import type { ClientInstrumentation } from '../common/types';
import {
  createSentryClientInstrumentation,
  type CreateSentryClientInstrumentationOptions,
} from './createClientInstrumentation';
import { instrumentHydratedRouter } from './hydratedRouter';

/**
 * Options for the React Router tracing integration.
 */
export interface ReactRouterTracingIntegrationOptions {
  /**
   * Options for React Router's instrumentation API.
   * @experimental
   */
  instrumentationOptions?: CreateSentryClientInstrumentationOptions;

  /** @deprecated `clientInstrumentation` is always built, so this flag is a no-op. Will be removed in a future major. */
  useInstrumentationAPI?: boolean;
}

/**
 * React Router tracing integration with support for the instrumentation API.
 */
export interface ReactRouterTracingIntegration extends Integration {
  /**
   * Client instrumentation to pass to `HydratedRouter`'s `instrumentations` prop.
   * @experimental
   */
  readonly clientInstrumentation: ClientInstrumentation;
}

/**
 * Browser tracing integration for React Router (Framework) applications.
 * This integration will create navigation spans and enhance transaction names with parameterized routes.
 */
export function reactRouterTracingIntegration(
  options: ReactRouterTracingIntegrationOptions = {},
): ReactRouterTracingIntegration {
  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    // Navigation transactions are started within the hydrated router instrumentation
    instrumentNavigation: false,
  });

  // Built eagerly so it can be passed to HydratedRouter's `instrumentations` prop. This has no
  // side effects - the API is only marked "used" once React Router invokes the `router()` hook.
  const clientInstrumentationInstance = createSentryClientInstrumentation(options.instrumentationOptions);

  return {
    ...browserTracingIntegrationInstance,
    name: 'ReactRouterTracingIntegration',
    afterAllSetup(client) {
      browserTracingIntegrationInstance.afterAllSetup(client);
      instrumentHydratedRouter();
    },
    get clientInstrumentation(): ClientInstrumentation {
      return clientInstrumentationInstance;
    },
  };
}
