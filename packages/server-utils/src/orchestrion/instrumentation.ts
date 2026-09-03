import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Client } from '@sentry/core';
import { addNonEnumerableProperty, debug, waitForTracingChannelBinding } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { getOrchestrionInjectedModules } from './detect';

// Marks an instrumentation callback as already run, so it subscribes at most once
// even when reached through several integration names (e.g. Deno wraps a shared
// integration under `DenoMysql`) or several clients.
const INSTRUMENTED = Symbol.for('SentryOrchestrionInstrumented');

// generic function arguments can only be `any`
// oxlint-disable-next-line typescript/no-explicit-any
type InstrumentationFn = ((...args: any[]) => void) & { [INSTRUMENTED]?: boolean };

const globalAny = globalThis as { Bun?: unknown; Deno?: unknown };
const isBun = typeof globalAny.Bun !== 'undefined';
const isDeno = typeof globalAny.Deno !== 'undefined';

/**
 * Run an integration's channel-subscription callback once one of its modules is
 * orchestrion-injected, and never more than once.
 *
 * Channel integrations must NOT subscribe eagerly at `Sentry.init()`: Node caps
 * the number of `diagnostics_channel` channels in use at 1024, and every default
 * channel integration binding several channels up front would burn that budget
 * for modules the app never loads. So we defer:
 *
 * - If a module is already injected, then a bundler transformed and loaded it
 *   (which records it via `orchestrionModuleInjected`), or the runtime hook
 *   injected it before `init()`, so subscribe right away.
 * - Otherwise wait for the `orchestrion.module-injected` event, which fires
 *   when the module is loaded and transformed, before it can publish to its
 *   channels.
 *
 * Bun and Deno have no such channel limit and no reliable per-module injection
 * tracking, so there we just subscribe immediately.
 *
 * `waitForTracingChannelBinding` still wraps the callback: the async-context
 * binding the subscription needs for span parenting may not exist yet.
 *
 * Note: it is possible to register extra event listeners, if the same callback
 * is registered multiple times. However, this is (a) not something that happens
 * normally, and (b) ultimately fine, because it'll only call the callback one
 * time. There'll just be a few no-op client event listeners.
 */
export function invokeOrchestrionInstrumentation<Callback extends InstrumentationFn>(
  client: Client,
  moduleNames: readonly string[],
  callback: Callback,
  args: Parameters<Callback>,
  // Most integrations parent spans via `bindTracingChannelToSpan`, which needs
  // the async-context binding set up at subscribe time. A few (e.g. Hapi,
  // KafkaJS, Koa, tedious) subscribe without it and create spans directly;
  // they pass `false` so a missing binding never blocks their subscription.
  { requiresTracingChannelBinding = true }: { requiresTracingChannelBinding?: boolean } = {},
): void {
  const label = moduleNames.join(', ');

  // `tracingChannel` is unavailable before Node 18.19; nothing to subscribe to.
  if (!diagnosticsChannel.tracingChannel) {
    DEBUG_BUILD && debug.log(`[instrumentation:${label}] no \`tracingChannel\` (Node < 18.19), not subscribing`);
    return;
  }

  if (hasBeenInstrumented(callback)) {
    DEBUG_BUILD && debug.log(`[instrumentation:${label}] already subscribed, skipping`);
    return;
  }

  // cleanup function is passed in so that we only remove the listener
  // once the callback is actually instrumented and called.
  const run = (cleanup?: () => void): void => {
    const subscribe = (): void => {
      if (hasBeenInstrumented(callback)) {
        return;
      }
      markInstrumented(callback);
      cleanup?.();
      DEBUG_BUILD && debug.log(`[instrumentation:${label}] subscribing to channels`);
      callback(...args);
    };

    if (!requiresTracingChannelBinding) {
      subscribe();
      return;
    }

    // Mark as instrumented only if the channel binding actually lands.
    // Avoids a very narrow case where the binding never arrives within the
    // retry window. So, don't mark until we know we're actually calling.
    waitForTracingChannelBinding(subscribe);

    // `waitForTracingChannelBinding` retries once on a timer and then gives up
    // silently. Not being subscribed by now means we took that path, so say so:
    // without this, an integration that never subscribes leaves no trace at all.
    if (DEBUG_BUILD && !hasBeenInstrumented(callback)) {
      debug.log(`[instrumentation:${label}] async-context binding not ready, retrying before subscribing`);
    }
  };

  if (isBun || isDeno) {
    DEBUG_BUILD && debug.log(`[instrumentation:${label}] Bun/Deno, subscribing eagerly`);
    run();
    return;
  }

  const injected = getOrchestrionInjectedModules();
  const injectedName = moduleNames.find(name => injected.includes(name));
  if (injectedName) {
    DEBUG_BUILD && debug.log(`[instrumentation:${label}] "${injectedName}" already injected, subscribing now`);
    run();
    return;
  }

  DEBUG_BUILD && debug.log(`[instrumentation:${label}] not injected yet, waiting for the module to load`);

  const cleanup = client.on('orchestrion.module-injected', (moduleName: string) => {
    if (hasBeenInstrumented(callback)) {
      cleanup();
      return;
    }
    if (moduleNames.includes(moduleName)) {
      DEBUG_BUILD && debug.log(`[instrumentation:${label}] "${moduleName}" injected at runtime, subscribing now`);
      run(cleanup);
    }
  });
}

function hasBeenInstrumented(callback: InstrumentationFn): boolean {
  return callback[INSTRUMENTED] ?? false;
}

function markInstrumented(callback: InstrumentationFn): void {
  addNonEnumerableProperty(callback, INSTRUMENTED, true);
}
