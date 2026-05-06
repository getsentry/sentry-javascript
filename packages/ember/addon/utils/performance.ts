/* eslint-disable max-lines */
import type ApplicationInstance from '@ember/application/instance';
import { _backburner, run } from '@ember/runloop';
import { getOwnConfig, importSync, isTesting, macroCondition } from '@embroider/macros';
import type { BrowserClient } from '@sentry/browser';
import { getClient } from '@sentry/browser';
import { addIntegration, GLOBAL_OBJ } from '@sentry/core';
import type { ExtendedBackburner } from '@sentry/ember/runloop';
import type { EmberSentryConfig, GlobalConfig, OwnConfig } from '../types';
import type { browserTracingIntegration as browserTracingIntegrationType } from './browserTracingIntegration';

export function getSentryConfig(): EmberSentryConfig {
  const _global = GLOBAL_OBJ as typeof GLOBAL_OBJ & GlobalConfig;
  _global.__sentryEmberConfig = _global.__sentryEmberConfig ?? {};
  const environmentConfig = getOwnConfig<OwnConfig>().sentryConfig;
  if (!environmentConfig.sentry) {
    environmentConfig.sentry = {
      browserTracingOptions: {},
    };
  }
  Object.assign(environmentConfig.sentry, _global.__sentryEmberConfig);
  return environmentConfig;
}

export function getBackburner(): Pick<ExtendedBackburner, 'on' | 'off'> {
  if (_backburner) {
    return _backburner as unknown as Pick<ExtendedBackburner, 'on' | 'off'>;
  }

  if ((run as unknown as { backburner?: Pick<ExtendedBackburner, 'on' | 'off'> }).backburner) {
    return (run as unknown as { backburner: Pick<ExtendedBackburner, 'on' | 'off'> }).backburner;
  }

  return {
    on() {
      // noop
    },
    off() {
      // noop
    },
  };
}

/**
 * Utility to register the browser tracing integration and instrument the app instance for performance.
 */
export function instrumentForPerformance(appInstance: ApplicationInstance): void {
  const config = getSentryConfig();
  // Maintaining backwards compatibility with config.browserTracingOptions, but passing it with Sentry options is preferred.
  const browserTracingOptions = config.browserTracingOptions || config.sentry.browserTracingOptions || {};

  const { browserTracingIntegration } = importSync('./browserTracingIntegration') as {
    browserTracingIntegration: typeof browserTracingIntegrationType;
  };

  const idleTimeout = config.transitionTimeout || 5000;

  const browserTracing = browserTracingIntegration({
    appInstance,
    idleTimeout,
    ...browserTracingOptions,
  });

  const client = getClient<BrowserClient>();
  const isAlreadyInitialized = macroCondition(isTesting()) ? client?.getIntegrationByName('BrowserTracing') : false;
  addIntegration(browserTracing);

  // Ensure this is re-run in tests even if the integration is already initialized
  if (isAlreadyInitialized && client) {
    browserTracing.afterAllSetup?.(client);
  }
}
