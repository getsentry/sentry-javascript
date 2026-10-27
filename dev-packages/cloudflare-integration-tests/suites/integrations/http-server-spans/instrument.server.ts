import { defineCloudflareOptions, httpServerIntegration } from '@sentry/cloudflare';

export default defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  traceLifecycle: 'static',
  integrations: [
    httpServerIntegration({
      ignoreIncomingRequests: urlPath => urlPath.startsWith('/health'),
      onSpanCreated: (span, request) => {
        span.setAttribute('test.on_span_created', new URL(request.url).pathname);
      },
      onSpanEnd: (span, _request, response) => {
        span.setAttribute('test.on_span_end', response.status);
      },
    }),
  ],
}));
