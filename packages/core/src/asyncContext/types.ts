import type { Scope } from '../scope';
import type { Span } from '../types/span';
import type { getTraceData } from '../utils/traceData';
import type {
  continueTrace,
  isTracingSuppressed,
  startInactiveSpan,
  startNewTrace,
  startSpan,
  startSpanManual,
  suppressTracing,
  withActiveSpan,
} from './../tracing/trace';
import type { getActiveSpan } from './../utils/spanUtils';

/*
 * @private Private API with no semver guarantees!
 *
 * A binding object used to enable context propagation for a tracing channel against a span
 */
export interface TracingChannelBinding {
  /**
   * The ALS instance that will be bound to the channel.
   */
  asyncLocalStorage: unknown;

  /**
   * Activates a span for the tracing channels nested invocations, the return value must be the same type as the `asyncLocalStorage` inner value.
   */
  getStoreWithActiveSpan: (span: Span) => unknown;
}

/**
 * @private Private API with no semver guarantees!
 *
 * Strategy used to track async context.
 */
export interface AsyncContextStrategy {
  /**
   * Fork the isolation scope inside of the provided callback.
   */
  withIsolationScope: <T>(callback: (isolationScope: Scope) => T) => T;

  /**
   * Fork the current scope inside of the provided callback.
   */
  withScope: <T>(callback: (isolationScope: Scope) => T) => T;

  /**
   * Set the provided scope as the current scope inside of the provided callback.
   */
  withSetScope: <T>(scope: Scope, callback: (scope: Scope) => T) => T;

  /**
   * Set the provided isolation as the current isolation scope inside of the provided callback.
   */
  withSetIsolationScope: <T>(isolationScope: Scope, callback: (isolationScope: Scope) => T) => T;

  /**
   * Get the currently active scope.
   */
  getCurrentScope: () => Scope;

  /**
   * Get the currently active isolation scope.
   */
  getIsolationScope: () => Scope;

  // OPTIONAL: Custom tracing methods
  // These are used so that we can provide OTEL-based implementations

  /** Start an active span. */
  startSpan?: typeof startSpan;

  /** Start an inactive span. */
  startInactiveSpan?: typeof startInactiveSpan;

  /** Start an active manual span. */
  startSpanManual?: typeof startSpanManual;

  /** Get the currently active span. */
  getActiveSpan?: typeof getActiveSpan;

  /** Make a span the active span in the context of the callback. */
  withActiveSpan?: typeof withActiveSpan;

  /** Suppress tracing in the given callback, ensuring no spans are generated inside of it.  */
  suppressTracing?: typeof suppressTracing;

  /** If tracing is suppressed in the given scope.  */
  isTracingSuppressed?: typeof isTracingSuppressed;

  /** Get trace data as serialized string values for propagation via `sentry-trace` and `baggage`. */
  getTraceData?: typeof getTraceData;

  /**
   * Continue a trace from `sentry-trace` and `baggage` values.
   * These values can be obtained from incoming request headers, or in the browser from `<meta name="sentry-trace">`
   * and `<meta name="baggage">` HTML tags.
   */
  continueTrace?: typeof continueTrace;

  /** Start a new trace, ensuring all spans in the callback share the same traceId. */
  startNewTrace?: typeof startNewTrace;

  /** Get the runtime store required to bind tracing channels to an active span. */
  getTracingChannelBinding?: () => TracingChannelBinding | undefined;
}
