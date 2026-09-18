import * as Sentry from '@sentry/bun';

// One scenario per process; the test picks the SDK setup through this variable.
const mode = process.env.BODY_MODE;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  // Request bodies are only attached to transaction events, so this suite needs the static trace lifecycle.
  traceLifecycle: 'static',
  ...(mode === 'explicit-small' && {
    dataCollection: { httpBodies: [] },
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'BunServer'),
      Sentry.bunServerIntegration({ maxRequestBodySize: 'small' }),
    ],
  }),
  ...(mode === 'explicit-none' && {
    dataCollection: { httpBodies: ['incomingRequest'] },
    integrations: integrations => [
      ...integrations.filter(integration => integration.name !== 'BunServer'),
      Sentry.bunServerIntegration({ maxRequestBodySize: 'none' }),
    ],
  }),
});

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    // Read the body after the SDK did, so the handler still gets the full payload.
    return new Response(await request.text());
  },
});

process.send?.(JSON.stringify({ event: 'READY', port: server.port }));
