import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry/browser';
import type { Integration } from '@sentry/core';
import type ApplicationInstance from '@ember/application/instance';
import { instrumentEmberAppInstanceForPerformance } from './instrumentEmberAppInstanceForPerformance';
import { instrumentGlobalsForPerformance } from './instrumentEmberGlobals';
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
    minimumRunloopQueueDuration: options.minimumRunloopQueueDuration,
    disableInstrumentComponents: options.disableInstrumentComponents ?? false,
    minimumComponentRenderDuration: options.minimumComponentRenderDuration,
    enableComponentDefinitions: options.enableComponentDefinitions ?? false,
    disableInitialLoadInstrumentation: options.disableInitialLoadInstrumentation ?? false,
  };

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      // Run this in the next tick to ensure the ember router etc. is properly initialized
      setTimeout(() => {
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
      });
    },
  };
}
