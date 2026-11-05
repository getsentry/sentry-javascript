import * as Sentry from '@sentry/aws-serverless';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const genAI = process.env.GEN_AI_DATA_COLLECTION && JSON.parse(process.env.GEN_AI_DATA_COLLECTION);
const awsOptions = process.env.AWS_INTEGRATION_OPTIONS && JSON.parse(process.env.AWS_INTEGRATION_OPTIONS);

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  dataCollection: genAI ? { genAI } : undefined,
  integrations: awsOptions ? [Sentry.awsIntegration(awsOptions)] : undefined,
  transport: loggingTransport,
});
