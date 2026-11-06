import * as Sentry from '@sentry/node';

// What the SDK warned about, for the test to read back.
const warnings = [];
const warn = console.warn;
console.warn = (...args) => {
  warnings.push(args.join(' '));
  warn(...args);
};

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [Sentry.serveTunnelIntegration()],
});

export const handler = async event => ({
  statusCode: 200,
  body: event?.readWarnings ? JSON.stringify(warnings) : 'app',
});
