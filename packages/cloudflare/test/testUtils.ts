import { context, propagation, trace } from '@opentelemetry/api';
import { getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getIsolationScope().setClient(undefined);
  getGlobalScope().clear();
  getGlobalScope().setClient(undefined);
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
