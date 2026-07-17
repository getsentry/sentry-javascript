import type { Client } from '@sentry/core';
import { addNonEnumerableProperty, waitForTracingChannelBinding } from '@sentry/core';
import { getOrchestrionInjectedModules } from './detect';
import * as diagnosticsChannel from 'node:diagnostics_channel';

const INSTRUMENTATION_FN_SYMBOL = Symbol.for('InstrumentationFn');
// oxlint-disable-next-line typescript/no-explicit-any
type InstrumentationFn = ((...args: any[]) => void) & { [INSTRUMENTATION_FN_SYMBOL]?: boolean };

const globalAny = globalThis as { Bun?: unknown; Deno?: unknown };
const isBun = typeof globalAny.Bun !== 'undefined';
const isDeno = typeof globalAny.Deno !== 'undefined';

/**
 * Run the provided instrumentation callback when one of the provided module names is orchestrion-injected.
 * If it is already injected, it will invoce the callback immediately (e.g. when build-time injection is used).
 * If runtime injection is used, it may invoke the callback at a later point in time, when the injection actually happens.
 * The callback will never be invoked more than once.
 */
export function invokeOrchestrionInstrumentation<Callback extends InstrumentationFn>(
  client: Client,
  moduleNames: string[],
  callback: Callback,
  args: Parameters<Callback>,
) {
  // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
  if (!diagnosticsChannel.tracingChannel) {
    return;
  }

  // If already injected, skip
  if (hasBeenInjected(callback)) {
    return;
  }

  const instrumentationFn = () => {
    markAsInjected(callback);

    waitForTracingChannelBinding(() => {
      callback(...args);
    });
  };

  // We do not have working module tracking in Deno or Bun
  // Additionally, the channel limits do not apply to these runtimes, so it is safe to just register all instrumentation immediately.
  if (isBun || isDeno) {
    instrumentationFn();
    return;
  }

  // First, check if the modules have been injected already
  const modules = getOrchestrionInjectedModules();
  if (moduleNames.some(name => modules.includes(name))) {
    instrumentationFn();
    return;
  }

  // Then, register a listener for the `orchestrion.module-runtime-injected` event
  const cleanup = client.on('orchestrion.module-runtime-injected', (moduleName: string) => {
    if (hasBeenInjected(callback)) {
      cleanup();
      return;
    }

    if (moduleNames.includes(moduleName)) {
      instrumentationFn();
      cleanup();
    }
  });
}

function hasBeenInjected(callback: InstrumentationFn) {
  return callback[INSTRUMENTATION_FN_SYMBOL] ?? false;
}

function markAsInjected(callback: InstrumentationFn) {
  addNonEnumerableProperty(callback, INSTRUMENTATION_FN_SYMBOL, true);
}
