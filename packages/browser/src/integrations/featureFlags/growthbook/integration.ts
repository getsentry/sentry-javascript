import type { IntegrationFn } from '@sentry/core';
import { growthbookIntegration as coreGrowthbookIntegration } from '@sentry/core';
import type { GrowthBookClass } from './types';

/**
 * Sentry integration for capturing feature flag evaluations from GrowthBook.
 *
 * See the feature flag documentation: https://develop.sentry.dev/sdk/expected-features/#feature-flags
 *
 * @example
 * ```
 * import { GrowthBook } from '@growthbook/growthbook';
 * import * as Sentry from '@sentry/browser';
 *
 * Sentry.init({
 *   dsn: '___PUBLIC_DSN___',
 *   integrations: [Sentry.growthbookIntegration({ growthbookClass: GrowthBook })],
 * });
 *
 * const gb = new GrowthBook();
 * gb.isOn('my-feature');
 * Sentry.captureException(new Error('something went wrong'));
 * ```
 */
export const growthbookIntegration = (({ growthbookClass }: { growthbookClass: GrowthBookClass }) =>
  coreGrowthbookIntegration({ growthbookClass })) satisfies IntegrationFn;
