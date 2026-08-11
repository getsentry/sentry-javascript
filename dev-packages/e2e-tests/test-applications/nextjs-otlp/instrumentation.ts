import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Order matters: the app's OpenTelemetry SDK claims the global tracer provider first, and
    // Sentry then attaches to it instead of setting up its own.
    await import('./otel.server.config');
    await import('./sentry.server.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
