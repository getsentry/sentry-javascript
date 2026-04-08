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

  /**
   * Enable React Router's instrumentation API.
   * When true, prepares for use with HydratedRouter's `unstable_instrumentations` prop.
   * @experimental
   * @default false
   */
  useInstrumentationAPI?: boolean;
}

/**
 * React Router tracing integration with support for the instrumentation API.
 */
export interface ReactRouterTracingIntegration extends Integration {
  /**
   * Client instrumentation for React Router's instrumentation API.
   * Lazily initialized on first access.
   * @experimental HydratedRouter doesn't invoke these hooks in Framework Mode yet.
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

  let clientInstrumentationInstance: ClientInstrumentation | undefined;

  if (options.useInstrumentationAPI || options.instrumentationOptions) {
    clientInstrumentationInstance = createSentryClientInstrumentation(options.instrumentationOptions);
  }

  const getClientInstrumentation = (): ClientInstrumentation => {
    if (!clientInstrumentationInstance) {
      clientInstrumentationInstance = createSentryClientInstrumentation(options.instrumentationOptions);
    }
    return clientInstrumentationInstance;
  };

  return {
    ...browserTracingIntegrationInstance,
    name: 'ReactRouterTracingIntegration',
    afterAllSetup(client) {
      browserTracingIntegrationInstance.afterAllSetup(client);
      instrumentHydratedRouter();
    },
    get clientInstrumentation(): ClientInstrumentation {
      return getClientInstrumentation();
    },
  };
}
