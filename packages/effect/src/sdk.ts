import type { Client } from '@sentry/core';
import { getIntegrationsToSetup, initAndBind, stackParserFromStackParserOptions } from '@sentry/core';
import type { EffectClientOptions, EffectOptions } from './client';
import { EffectClient } from './client';

/**
 * The Sentry Effect SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in your application.
 *
 * @example
 *
 * ```
 * import { init } from '@sentry/effect';
 *
 * init({
 *   dsn: '__DSN__',
 *   transport: myTransport,
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 * import { addBreadcrumb } from '@sentry/effect';
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 * ```
 *
 * @example
 *
 * ```
 * import * as Sentry from '@sentry/effect';
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 * ```
 *
 * @see {@link EffectOptions} for documentation on configuration options.
 */
export function init(options: EffectOptions & { transport: EffectClientOptions['transport'] }): Client | undefined {
  const clientOptions: EffectClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || []),
    integrations: getIntegrationsToSetup({
      integrations: options.integrations,
      defaultIntegrations: options.defaultIntegrations ?? [],
    }),
    transport: options.transport,
  };

  return initAndBind(EffectClient, clientOptions);
}
