import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The instrumentation hook and the route handlers must share one copy of each OpenTelemetry
  // package, otherwise the providers registered at startup are invisible to the request path.
  serverExternalPackages: [
    '@opentelemetry/api',
    '@opentelemetry/exporter-metrics-otlp-http',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-metrics',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/sdk-trace-node',
  ],
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
