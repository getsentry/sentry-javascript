import type { IntegrationFn, ServerTunnelOptions } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import {
  _INTERNAL_instrumentTunnelServers as instrumentTunnelServers,
  serveTunnelIntegration as originalServeTunnelIntegration,
} from '@sentry/server-utils';
import { redirectLambdaHandlerForTunnel } from '../lambda/redirectHandler';

/**
 * Lets every `node:http` server, and the Lambda handler, answer managed tunnel requests before the app sees them.
 * Nothing is answered until the tunnel is on. For framework SDKs that enable the tunnel after `init`, like TanStack
 * Start's `tunnelRoute`.
 */
export function installTunnelHooks(): void {
  instrumentTunnelServers();
  redirectLambdaHandlerForTunnelIfOnLambda();
}

function redirectLambdaHandlerForTunnelIfOnLambda(): void {
  // Lambda runs no HTTP server, so its handler is wrapped to answer tunnel requests.
  if (process.env.LAMBDA_TASK_ROOT) {
    redirectLambdaHandlerForTunnel();
  }
}

const _serveTunnelIntegration = ((options: ServerTunnelOptions = {}) => {
  return {
    ...originalServeTunnelIntegration(options),
    afterAllSetup() {
      // After every `setupOnce`, so the redirect of `@sentry/aws-serverless`, whose handler answers tunnel requests
      // too, goes first and this one stays out of it.
      if (options.intercept !== false) {
        redirectLambdaHandlerForTunnelIfOnLambda();
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Lets your server forward the events of a browser SDK set up with `tunnel: true` to Sentry.
 *
 * With this integration on the server and `tunnel: true` in the browser `init`, the browser sends its events to your
 * own server instead of Sentry, where ad-blockers can't drop them, and your server forwards them to Sentry.
 *
 * Every `node:http` server answers the tunnel requests before the app sees them, and so does the Lambda handler when
 * `init` runs from a preload. To serve them from your own code instead, set `intercept: false` and call
 * `handleTunnelRequestIfMatched`.
 *
 * By default only envelopes for the server's own DSN are forwarded.
 *
 * @example
 * ```js
 * // Server
 * Sentry.init({
 *   dsn: '__DSN__',
 *   integrations: [Sentry.serveTunnelIntegration()],
 * });
 *
 * // Browser
 * Sentry.init({
 *   dsn: '__DSN__',
 *   tunnel: true,
 * });
 * ```
 */
export const serveTunnelIntegration = defineIntegration(_serveTunnelIntegration);
