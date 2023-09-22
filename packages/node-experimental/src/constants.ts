import { createContextKey } from '@opentelemetry/api';

export const OTEL_CONTEXT_HUB_KEY = createContextKey('sentry_hub');
