import { getMainCarrier } from '../carrier';
import type { Scope } from '../scope';
import { spanIsIgnored } from '../tracing/trace';
import { _setSpanForScope } from '../utils/spanOnScope';
import { getRootSpan } from '../utils/spanUtils';
import { safeUnref } from '../utils/timer';
import { getAsyncContextStrategy } from './index';
import type { TracingChannelBinding } from './types';

/**
 * Execute a callback whenever the tracing channel binding is available.
 * If it is not available after retry, the callback is not executed.
 */
export function waitForTracingChannelBinding(callback: () => void, retries = 1): void {
  const binding = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.();

  if (binding) {
    callback();
    return;
  }

  if (!retries) {
    return;
  }

  // It is possible that the binding is not available yet when this is initially called
  // This happens when users use a custom OTEL setup
  // In this case, we wait for a tick and try again afterwards
  // If it still fails, we bail and do nothing
  // `safeUnref` so this retry timer never keeps the process alive on its own (Node server runtimes).
  safeUnref(
    setTimeout(() => {
      waitForTracingChannelBinding(callback, retries - 1);
    }, 1),
  );
}

/**
 * Build the default {@link TracingChannelBinding} shared by AsyncLocalStorage-based strategies.
 *
 * The ALS instance is supplied by the caller (kept as `unknown`).
 * The binding clones the current scope, plants the span on it, and reuses the existing isolation scope.
 *
 * The OpenTelemetry strategy does not use this: its store value is an OTel context, not a
 * `{ scope, isolationScope }` pair.
 */
export function _INTERNAL_createTracingChannelBinding(
  asyncLocalStorage: NonNullable<unknown>,
  getScopes: () => { scope: Scope; isolationScope: Scope },
): TracingChannelBinding {
  return {
    asyncLocalStorage,
    getStoreWithActiveSpan: span => {
      const { scope, isolationScope } = getScopes();
      const activeScope = scope.clone();
      // Whether an ignored span becomes the active span decides what its descendants and outgoing
      // requests propagate from, so it must follow the same rule everywhere:
      //
      // - Ignored *child*: keep the parent active. No span is emitted for the ignored child, so if it
      //   became active its descendants would parent to (and propagate a `sentry-trace` referencing) a
      //   span that never reaches Sentry, producing orphaned/misparented spans downstream. Leaving the
      //   parent active re-parents them onto the nearest emitted span instead.
      // - Ignored *root*: keep it active so the whole subtree is dropped with it. That is the point of
      //   `ignoreSpans` on a root; not activating it would let its children escape and be emitted as
      //   standalone spans.
      //
      // This is the no-tracer-provider (AsyncLocalStorage) counterpart of the tracer-provider path in
      // `@sentry/opentelemetry`'s `getStoreWithActiveSpan`, which applies the same
      // `spanIsIgnored(span) && getRootSpan(span) !== span` check on the OTel context (it additionally
      // consults trace state to carry the "child ignored" decision across process boundaries, which the
      // channel binding does not need). Keeping the rule identical means `ignoreSpans` behaves the same
      // whether or not Sentry owns an OpenTelemetry tracer provider.
      if (!spanIsIgnored(span) || getRootSpan(span) === span) {
        _setSpanForScope(activeScope, span);
      }

      return { scope: activeScope, isolationScope };
    },
  };
}
