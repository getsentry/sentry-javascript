import { getCurrentHub, initAndBind } from '@sentry/core';
import { getMainCarrier, setHubOnCarrier } from '@sentry/hub';
import { getGlobalObject } from '@sentry/utils';
import { ServerlessOptions } from './backend';
import { AWSLambda } from './integrations';
import { ServerlessClient } from './client';
import * as domain from 'domain';

export const defaultIntegrations = [new AWSLambda({})];

/**
 * The Sentry Browser SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible when
 * loading the web page. To set context information or send manual events, use
 * the provided methods.
 *
 */
export function init(options: ServerlessOptions = {}): void {
  if (options.dsn === undefined && process.env.SENTRY_DSN) {
    options.dsn = process.env.SENTRY_DSN;
  }

  if (options.release === undefined) {
    const global = getGlobalObject<Window>();
    // Prefer env var over global
    if (process.env.SENTRY_RELEASE) {
      options.release = process.env.SENTRY_RELEASE;
    } else if (global.SENTRY_RELEASE && global.SENTRY_RELEASE.id) {
      options.release = global.SENTRY_RELEASE.id;
    }
  }

  if (options.environment === undefined && process.env.SENTRY_ENVIRONMENT) {
    options.environment = process.env.SENTRY_ENVIRONMENT;
  }

  if ((domain as any).active) {
    setHubOnCarrier(getMainCarrier(), getCurrentHub());
  }

  initAndBind(ServerlessClient, options);
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export async function flush(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<ServerlessClient>();
  if (client) {
    return client.flush(timeout);
  }
  return Promise.reject(false);
}
