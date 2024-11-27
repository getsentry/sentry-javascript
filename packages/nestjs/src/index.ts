import { nestIntegration as nestIntegrationAlias } from '@sentry/node';

export * from '@sentry/node';

/**
 * Integration capturing tracing data for NestJS.
 */
// eslint-disable-next-line deprecation/deprecation
export const nestIntegration = nestIntegrationAlias;

// TODO(v9): Export custom `getDefaultIntegrations` from this SDK that automatically registers the `nestIntegration`.

export { init } from './sdk';

export {
  SentryTraced,
  SentryCron,
  // eslint-disable-next-line deprecation/deprecation
  WithSentry,
  SentryExceptionCaptured,
} from './decorators';
