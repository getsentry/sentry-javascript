import { context, propagation, trace } from '@opentelemetry/api';
import { getMainCarrier } from '@sentry/core';

function resetGlobals(): void {
  getMainCarrier().__SENTRY__ = undefined;
}

function cleanupOtel(): void {
  // Disable all globally registered APIs
  trace.disable();
  context.disable();
  propagation.disable();
}

export function resetSdk(): void {
  resetGlobals();
  cleanupOtel();
}
