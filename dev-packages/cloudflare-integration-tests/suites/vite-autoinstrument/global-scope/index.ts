import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

function loadConfig(): { greeting: string } {
  try {
    return JSON.parse('{ not json');
  } catch (error) {
    Sentry.captureException(error);
    return { greeting: 'hello' };
  }
}

// Runs while the worker entry is evaluated, before any handler is invoked.
const config = Sentry.startSpan({ name: 'startup.load-config', op: 'function' }, () => loadConfig());

export default {
  async fetch(): Promise<Response> {
    return Response.json(config);
  },
} satisfies ExportedHandler<Env>;
