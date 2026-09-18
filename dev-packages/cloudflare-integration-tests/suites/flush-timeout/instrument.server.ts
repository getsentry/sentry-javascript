import { defineCloudflareOptions } from '@sentry/cloudflare';
import { lastSend } from './lastSend';

interface Env {
  SENTRY_DSN: string;
  SERVER_URL: string;
  // "true" sends envelopes to SERVER_URL, a server that never answers
  SLOW_INGEST?: string;
  // "false" creates one client per invocation, which waits for the invocation's flush lock
  CACHE_CLIENT?: string;
  // "true" samples every trace, so the Workflow steps create spans to send
  TRACING?: string;
}

export default defineCloudflareOptions((env: Env) => ({
  dsn: env.SLOW_INGEST === 'true' ? `${env.SERVER_URL.replace('://', '://public@')}/1337` : env.SENTRY_DSN,
  cacheClient: env.CACHE_CLIENT !== 'false',
  tracesSampleRate: env.TRACING === 'true' ? 1 : undefined,
  transportOptions: {
    fetch: (input, init) => {
      init?.signal?.addEventListener('abort', () => (lastSend.aborted = true));
      return fetch(input, init);
    },
  },
}));
