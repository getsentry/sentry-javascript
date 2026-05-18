import * as api from '@opentelemetry/api';
import type { Scope, Span, withActiveSpan as defaultWithActiveSpan } from '@sentry/core';
import {
  _INTERNAL_safeMathRandom,
  _INTERNAL_setSpanForScope,
  baggageHeaderToDynamicSamplingContext,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  setAsyncContextStrategy,
} from '@sentry/core';
import {
  SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY,
  SENTRY_FORK_SET_SCOPE_CONTEXT_KEY,
  SENTRY_TRACE_STATE_DSC,
  SENTRY_TRACE_STATE_SAMPLE_RAND,
} from './constants';
import { continueTrace, startInactiveSpan, startNewTrace, startSpan, startSpanManual, withActiveSpan } from './trace';
import type { CurrentScopes } from './types';
import { getContextFromScope, getScopesFromContext } from './utils/contextData';
import { getSamplingDecision } from './utils/getSamplingDecision';
import { getActiveSpan } from './utils/getActiveSpan';
import { getTraceData } from './utils/getTraceData';
import { suppressTracing } from './utils/suppressTracing';
import { isSentryTraceProviderSpan } from './sentryTraceProvider';

/**
 * Sets the async context strategy to use follow the OTEL context under the hood.
 * We handle forking a hub inside of our custom OTEL Context Manager (./otelContextManager.ts)
 */
export function setOpenTelemetryContextAsyncContextStrategy(
  options: { useOpenTelemetrySpanCreation?: boolean } = {},
): void {
  const { useOpenTelemetrySpanCreation = true } = options;

  function getScopes(): CurrentScopes {
    const ctx = api.context.active();
    const scopes = getScopesFromContext(ctx);

    if (scopes) {
      return scopes;
    }

    // fallback behavior:
    // if, for whatever reason, we can't find scopes on the context here, we have to fix this somehow
    return {
      scope: getDefaultCurrentScope(),
      isolationScope: getDefaultIsolationScope(),
    };
  }

  function withScope<T>(callback: (scope: Scope) => T): T {
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which uses the presence of this key to determine if it should
    // fork the isolation scope, or not
    // as by default, we don't want to fork this, unless triggered explicitly by `withScope`
    return api.context.with(ctx, () => {
      return callback(getCurrentScope());
    });
  }

  function withSetScope<T>(scope: Scope, callback: (scope: Scope) => T): T {
    const ctx = getContextFromScope(scope) || api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_SET_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which picks up this scope as the current scope
    return api.context.with(ctx.setValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY, scope), () => {
      return callback(scope);
    });
  }

  function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T {
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which uses the presence of this key to determine if it should
    // fork the isolation scope, or not
    return api.context.with(ctx.setValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY, true), () => {
      return callback(getIsolationScope());
    });
  }

  function withSetIsolationScope<T>(isolationScope: Scope, callback: (isolationScope: Scope) => T): T {
    const ctx = api.context.active();

    // We depend on the otelContextManager to handle the context/hub
    // We set the `SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY` context value, which is picked up by
    // the OTEL context manager, which uses the presence of this key to determine if it should
    // fork the isolation scope, or not
    return api.context.with(ctx.setValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY, isolationScope), () => {
      return callback(getIsolationScope());
    });
  }

  function getCurrentScope(): Scope {
    const scope = getScopes().scope;
    if (!useOpenTelemetrySpanCreation) {
      syncOpenTelemetrySpanWithScope(scope);
    }
    return scope;
  }

  function getIsolationScope(): Scope {
    return getScopes().isolationScope;
  }

  function withActiveSpanContextOnly<T>(span: Span | null, callback: (scope: Scope) => T): T {
    const ctx = span
      ? api.trace.setSpan(api.context.active(), span as api.Span)
      : api.trace.deleteSpan(api.context.active());

    return api.context.with(ctx, () => {
      const scope = getCurrentScope();
      _INTERNAL_setSpanForScope(scope, span || undefined);
      return callback(scope);
    });
  }

  function syncOpenTelemetrySpanWithScope(scope: Scope): void {
    const activeSpan = api.trace.getSpan(api.context.active()) as Span | undefined;

    if (!activeSpan) {
      return;
    }

    const scopeSpan = scope.getScopeData().span;
    if (scopeSpan === activeSpan) {
      return;
    }

    const activeSpanContext = activeSpan.spanContext();
    if (activeSpanContext.isRemote) {
      if (scopeSpan) {
        return;
      }

      // A remote OTel span context represents an incoming parent, not a local span
      // we can finish and send. Store it as propagation context so the next core
      // root span continues the trace and becomes the transaction segment.
      const dsc =
        baggageHeaderToDynamicSamplingContext(activeSpanContext.traceState?.get(SENTRY_TRACE_STATE_DSC)) ?? {};
      const sampleRandString = activeSpanContext.traceState?.get(SENTRY_TRACE_STATE_SAMPLE_RAND) ?? dsc?.sample_rand;
      const sampleRand = typeof sampleRandString === 'string' ? Number(sampleRandString) : undefined;

      scope.setPropagationContext({
        traceId: activeSpanContext.traceId,
        parentSpanId: activeSpanContext.spanId,
        sampled: getSamplingDecision(activeSpanContext),
        dsc,
        sampleRand:
          typeof sampleRand === 'number' && !Number.isNaN(sampleRand) ? sampleRand : _INTERNAL_safeMathRandom(),
      });
      return;
    }

    if (scopeSpan && !isSentryTraceProviderSpan(scopeSpan)) {
      return;
    }

    _INTERNAL_setSpanForScope(scope, activeSpan);
  }

  const baseStrategy = {
    withScope,
    withSetScope,
    withSetIsolationScope,
    withIsolationScope,
    getCurrentScope,
    getIsolationScope,
  };

  if (!useOpenTelemetrySpanCreation) {
    setAsyncContextStrategy({
      ...baseStrategy,
      // Keep OTEL Context and Sentry Scope active-span state in sync, but let
      // the core tracing implementation create and send spans.
      withActiveSpan: withActiveSpanContextOnly as typeof defaultWithActiveSpan,
    });
    return;
  }

  setAsyncContextStrategy({
    ...baseStrategy,
    startSpan,
    startSpanManual,
    startInactiveSpan,
    getActiveSpan,
    suppressTracing,
    getTraceData,
    continueTrace,
    startNewTrace,
    // The types here don't fully align, because our own `Span` type is narrower
    // than the OTEL one - but this is OK for here, as we now we'll only have OTEL spans passed around
    withActiveSpan: withActiveSpan as typeof defaultWithActiveSpan,
  });
}
