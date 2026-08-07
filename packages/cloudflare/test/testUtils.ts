import { context, propagation, trace } from '@opentelemetry/api';
import { getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import { _clearGlobalClientCache } from '../src/clientCache';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
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
  _clearGlobalClientCache();
}
