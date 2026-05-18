import {
  addIntegration,
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry/browser';
import type { Integration } from '@sentry/core';
import type ApplicationInstance from '@ember/application/instance';
import { instrumentEmberAppInstanceForPerformance } from './instrumentEmberAppInstanceForPerformance.ts';
import { instrumentGlobalsForPerformance } from './instrumentEmberGlobals.ts';
import { isTesting, macroCondition } from '@embroider/macros';

type EmberBrowserTracingIntegrationOptions = Parameters<typeof originalBrowserTracingIntegration>[0] & {
  appInstance: ApplicationInstance;
  disableRunloopPerformance?: boolean;
  minimumRunloopQueueDuration?: number;
  disableInstrumentComponents?: boolean;
  minimumComponentRenderDuration?: number;
  enableComponentDefinitions?: boolean;
  disableInitialLoadInstrumentation?: boolean;
};

let _initialized = false;

export function browserTracingIntegration(options: EmberBrowserTracingIntegrationOptions): Integration {
  const { appInstance } = options;

  const instrumentNavigation = options.instrumentNavigation ?? true;
  const instrumentPageLoad = options.instrumentPageLoad ?? true;

  const integration = originalBrowserTracingIntegration({
    ...options,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  const appInstancePerformanceConfig = {
    disableRunloopPerformance: options.disableRunloopPerformance ?? false,
    instrumentPageLoad,
    instrumentNavigation,
  };

  const globalsPerformanceConfig = {
    disableRunloopPerformance: options.disableRunloopPerformance ?? false,
    minimumRunloopQueueDuration: options.minimumRunloopQueueDuration ?? 0,
    disableInstrumentComponents: options.disableInstrumentComponents ?? false,
    minimumComponentRenderDuration: options.minimumComponentRenderDuration ?? 0,
    enableComponentDefinitions: options.enableComponentDefinitions ?? false,
    disableInitialLoadInstrumentation: options.disableInitialLoadInstrumentation ?? false,
  };

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      instrumentEmberAppInstanceForPerformance(
        client,
        appInstance,
        appInstancePerformanceConfig,
        startBrowserTracingPageLoadSpan,
        startBrowserTracingNavigationSpan,
      );

      // We only want to run this once in tests!
      if (macroCondition(isTesting())) {
        if (_initialized) {
          return;
        }
      }

      instrumentGlobalsForPerformance(globalsPerformanceConfig);
      _initialized = true;
    },
  };
}

/**
 * Utility to simplify adding the browser tracing integration to an app instance.
 */
export function instrumentAppInstancePerformance(
  appInstance: ApplicationInstance,
  options: Partial<Parameters<typeof browserTracingIntegration>[0]>,
): void {
  addIntegration(
    browserTracingIntegration({
      ...options,
      appInstance,
    }),
  );
}
