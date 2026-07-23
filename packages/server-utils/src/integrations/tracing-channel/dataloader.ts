import * as diagnosticsChannel from 'node:diagnostics_channel';
import { CACHE_KEY, SENTRY_KIND } from '@sentry/conventions/attributes';
import type { IntegrationFn, Span, StartSpanOptions } from '@sentry/core';
import {
  debug,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  startSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { ChannelName } from '../../orchestrion/channels';
import { CHANNELS } from '../../orchestrion/channels';
import type { TracingChannelPayloadWithSpan } from '../../tracing-channel';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Dataloader' integration is omitted from the default set.
const INTEGRATION_NAME = 'Dataloader' as const;

const MODULE_NAME = 'dataloader';
const ORIGIN = 'auto.db.orchestrion.dataloader';

// `load`, `loadMany` and `batch` are cache reads; the rest are cache mutations that get no `op`.
const CACHE_GET_OP = 'cache.get';

type Operation = 'load' | 'loadMany' | 'batch' | 'prime' | 'clear' | 'clearAll';

// The link shape shared between a `load` span and the `batch` span it triggers.
type DataLoaderSpanLink = { context: ReturnType<Span['spanContext']> };

// The private batch object `dataloader` stores on the loader. We stash the pending `load` span links
// here (matching the vendored OTel instrumentation) so the batch span can link back to them.
interface DataLoaderBatch {
  spanLinks?: DataLoaderSpanLink[];
}

interface DataLoaderInstance {
  name?: string | null;
  _batch?: DataLoaderBatch | null;
}

/**
 * The shape orchestrion's transform attaches to the tracing-channel `context`. Documented here rather
 * than imported because orchestrion's runtime doesn't export it.
 */
interface DataLoaderChannelContext {
  arguments: unknown[];
  self?: DataLoaderInstance;
  result?: unknown;
  error?: unknown;
}

// Marks a wrapped `batchLoadFn` so a re-used loader (or a double construct) isn't wrapped twice.
const WRAPPED = Symbol('sentry.dataloader.wrapped');

function getSpanName(loader: DataLoaderInstance | undefined, operation: Operation): string {
  const name = loader?.name;

  return name ? `${MODULE_NAME}.${operation} ${name}` : `${MODULE_NAME}.${operation}`;
}

// `load` receives a single key, `loadMany`/`batch` receive a key array. Normalize both to the
// `string[]` shape `cache.key` expects.
function getCacheKey(keyArg: unknown): string[] | undefined {
  if (Array.isArray(keyArg)) {
    return keyArg.map(key => String(key));
  }

  return keyArg == null ? undefined : [String(keyArg)];
}

function makeSpanOptions(
  loader: DataLoaderInstance | undefined,
  operation: Operation,
  keyArg?: unknown,
): StartSpanOptions {
  const isCacheGet = operation === 'load' || operation === 'loadMany' || operation === 'batch';

  return {
    name: getSpanName(loader, operation),
    op: isCacheGet ? CACHE_GET_OP : undefined,
    onlyIfParent: true,
    attributes: {
      // Every direct operation (`load`/`loadMany`/`prime`/`clear`/`clearAll`) is a client call, matching
      // the vendored OTel instrumentation. The `batch` runs off a deferred tick with no obvious network
      // peer, so it gets no kind.
      [SENTRY_KIND]: operation === 'batch' ? undefined : 'client',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
      [CACHE_KEY]: isCacheGet ? getCacheKey(keyArg) : undefined,
    },
  };
}

const _dataloaderChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD && debug.log('[orchestrion:dataloader] subscribing to dataloader tracing channels');

      waitForTracingChannelBinding(() => {
        subscribeConstruct();
        subscribeLoad();
        subscribeSimpleOperation(CHANNELS.DATALOADER_LOAD_MANY, 'loadMany');
        subscribeSimpleOperation(CHANNELS.DATALOADER_PRIME, 'prime');
        subscribeSimpleOperation(CHANNELS.DATALOADER_CLEAR, 'clear');
        subscribeSimpleOperation(CHANNELS.DATALOADER_CLEAR_ALL, 'clearAll');
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Wraps the user's `batchLoadFn` (constructor arg 0) so the batch span opens when it runs on the
 * deferred dispatch tick. The span links back to the `load` calls that populated the batch.
 */
function subscribeConstruct(): void {
  diagnosticsChannel
    .tracingChannel<DataLoaderChannelContext>(CHANNELS.DATALOADER_CONSTRUCT)
    .start.subscribe(message => {
      const data = message as DataLoaderChannelContext;
      const batchLoadFn = data.arguments[0];
      if (typeof batchLoadFn !== 'function' || (batchLoadFn as { [WRAPPED]?: boolean })[WRAPPED]) {
        return;
      }

      const original = batchLoadFn as (...args: unknown[]) => unknown;
      const wrapped = function (this: DataLoaderInstance, ...args: unknown[]): unknown {
        // `batchLoadFn` receives the batched keys as its first argument.
        return startSpan({ ...makeSpanOptions(this, 'batch', args[0]), links: this._batch?.spanLinks }, () =>
          original.apply(this, args),
        );
      };
      (wrapped as { [WRAPPED]?: boolean })[WRAPPED] = true;
      data.arguments[0] = wrapped;
    });
}

/**
 * `load` is a cache read that additionally records its span so the batch it feeds into can link back.
 *
 * The span itself is `Async` (ends on `asyncEnd`, so its duration covers the awaited load). But the
 * link has to be recorded earlier, on the synchronous `end` (fired when `load` returns): the batch
 * dispatches on a deferred tick and reads `spanLinks` at batch-span creation, which happens BEFORE
 * `load`'s promise resolves (`asyncEnd`) — so recording at span end would be too late and drop the
 * link. The sync `end` runs after `dataloader` has assigned `this._batch` in `load`'s body and before
 * the deferred dispatch, so the link lands in time.
 */
function subscribeLoad(): void {
  const channel = diagnosticsChannel.tracingChannel<DataLoaderChannelContext>(CHANNELS.DATALOADER_LOAD);

  bindTracingChannelToSpan(channel, data => startInactiveSpanFor(data.self, 'load', data.arguments[0]), {
    requiresParentSpan: true,
  });

  channel.end.subscribe(message => {
    const data = message as TracingChannelPayloadWithSpan<DataLoaderChannelContext>;
    const span = data._sentrySpan;
    const batch = data.self?._batch;
    if (span && batch && span.isRecording()) {
      (batch.spanLinks ??= []).push({ context: span.spanContext() });
    }
  });
}

function subscribeSimpleOperation(channelName: ChannelName, operation: Operation): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<DataLoaderChannelContext>(channelName),
    data => startInactiveSpanFor(data.self, operation, data.arguments[0]),
    { requiresParentSpan: true },
  );
}

function startInactiveSpanFor(loader: DataLoaderInstance | undefined, operation: Operation, keyArg?: unknown): Span {
  return startInactiveSpan(makeSpanOptions(loader, operation, keyArg));
}

/**
 * EXPERIMENTAL: orchestrion-driven `dataloader` integration.
 *
 * Subscribes to the `orchestrion:dataloader:*` diagnostics_channels that the orchestrion code
 * transform injects into `dataloader`'s constructor and prototype methods. Requires the orchestrion
 * runtime hook or bundler plugin to be active.
 */
export const dataloaderChannelIntegration = defineIntegration(_dataloaderChannelIntegration);
