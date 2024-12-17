export * from '@sentry/node';

export { nestIntegration } from './integrations/nest';

export { init, getDefaultIntegrations } from './sdk';

export {
  SentryTraced,
  SentryCron,
  // eslint-disable-next-line deprecation/deprecation
  WithSentry,
  SentryExceptionCaptured,
} from './decorators';
