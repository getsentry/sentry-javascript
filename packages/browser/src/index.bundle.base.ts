import type { IntegrationFn } from '@sentry/types/src';

export * from './exports';

import type { Integration } from '@sentry/types';

import { WINDOW } from './helpers';

let windowIntegrations = {};

// This block is needed to add compatibility with the integrations packages when used with a CDN
if (WINDOW.Sentry && WINDOW.Sentry.Integrations) {
  windowIntegrations = WINDOW.Sentry.Integrations;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INTEGRATIONS: Record<string, (new (...args: any[]) => Integration) | IntegrationFn> = {
  ...windowIntegrations,
};

export { INTEGRATIONS as Integrations };
