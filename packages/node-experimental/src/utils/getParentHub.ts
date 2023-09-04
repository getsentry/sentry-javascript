import * as api from '@opentelemetry/api';
import { getCurrentHub } from '@sentry/core';
import type { Hub } from '@sentry/types';

import { OTEL_CONTEXT_HUB_KEY, OTEL_CONTEXT_PARENT_KEY } from '../sdk/otelContextManager';

/**
 * Get the hub of the parent context.
 * Can be useful if you e.g. need to add a breadcrumb from inside of an ongoing span.
 *
 * Without this, if you e.g. try to add a breadcrumb from an instrumentation's `onSpan` callback or similar,
 * you'll always attach it to the current hub, which in that case will be hyper specific to the instrumentation.
 */
export function getParentHub(): Hub {
  const ctx = api.context.active();
  const parentContext = ctx?.getValue(OTEL_CONTEXT_PARENT_KEY) as api.Context | undefined;

  const parentHub = parentContext && (parentContext.getValue(OTEL_CONTEXT_HUB_KEY) as Hub | undefined);

  return parentHub || getCurrentHub();
}
