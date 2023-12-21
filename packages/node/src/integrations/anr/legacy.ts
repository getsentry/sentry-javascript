import { getClient } from '@sentry/core';
import { Anr } from '.';
import type { NodeClient } from '../../client';

// TODO (v8): Remove this entire file and the `enableAnrDetection` export

interface LegacyOptions {
  entryScript: string;
  pollInterval: number;
  anrThreshold: number;
  captureStackTrace: boolean;
  debug: boolean;
}

/**
 * @deprecated Use the `Anr` integration instead.
 *
 * ```ts
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *   dsn: '__DSN__',
 *   integrations: [new Sentry.Integrations.Anr({ captureStackTrace: true })],
 * });
 * ```
 */
export function enableAnrDetection(options: Partial<LegacyOptions>): Promise<void> {
  const client = getClient() as NodeClient;
  const integration = new Anr(options);
  integration.setup(client);
  return Promise.resolve();
}
