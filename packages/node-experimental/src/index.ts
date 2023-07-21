import { Integrations as CoreIntegrations } from '@sentry/core';

import * as NodePreviewIntegrations from './integrations';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...NodePreviewIntegrations,
};

export { init } from './sdk/init';
export { INTEGRATIONS as Integrations };
export { getAutoPerformanceIntegrations } from './integrations/getAutoPerformanceIntegrations';
export * as Handlers from './sdk/handlers';
