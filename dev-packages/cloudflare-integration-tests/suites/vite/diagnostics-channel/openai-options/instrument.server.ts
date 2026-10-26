import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.defineCloudflareOptions((env: Env) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1,
  // `dataCollection` records inputs by default. The integration options must win over it.
  integrations: [Sentry.openAIIntegration({ recordInputs: false })],
}));
