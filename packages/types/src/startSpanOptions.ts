import type { Instrumenter } from './instrumenter';
import type { Primitive } from './misc';
import type { Scope } from './scope';
import type { SpanAttributes, SpanOrigin, SpanTimeInput } from './span';
import type { TransactionContext, TransactionMetadata, TransactionSource } from './transaction';

export interface StartSpanOptions extends TransactionContext {
  /** A manually specified start time for the created `Span` object. */
  startTime?: SpanTimeInput;

  /** If defined, start this span off this scope instead off the current scope. */
  scope?: Scope;

  /** The name of the span. */
  name: string;

  /** An op for the span. This is a categorization for spans. */
  op?: string;

  /** The origin of the span - if it comes from auto instrumenation or manual instrumentation. */
  origin?: SpanOrigin;

  /** Attributes for the span. */
  attributes?: SpanAttributes;

  // All remaining fields are deprecated

  /**
   * @deprecated Manually set the end timestamp instead.
   */
  trimEnd?: boolean;

  /**
   * @deprecated This cannot be set manually anymore.
   */
  parentSampled?: boolean;

  /**
   * @deprecated Use attributes or set data on scopes instead.
   */
  metadata?: Partial<TransactionMetadata>;

  /**
   * The name thingy.
   * @deprecated Use `name` instead.
   */
  description?: string;

  /**
   * @deprecated Use `span.setStatus()` instead.
   */
  status?: string;

  /**
   * @deprecated Use `scope` instead.
   */
  parentSpanId?: string;

  /**
   * @deprecated You cannot manually set the span to sampled anymore.
   */
  sampled?: boolean;

  /**
   * @deprecated You cannot manually set the spanId anymore.
   */
  spanId?: string;

  /**
   * @deprecated You cannot manually set the traceId anymore.
   */
  traceId?: string;

  /**
   * @deprecated Use an attribute instead.
   */
  source?: TransactionSource;

  /**
   * @deprecated Use attributes or set tags on the scope instead.
   */
  tags?: { [key: string]: Primitive };

  /**
   * @deprecated Use attributes instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: { [key: string]: any };

  /**
   * @deprecated Use `startTime` instead.
   */
  startTimestamp?: number;

  /**
   * @deprecated Use `span.end()` instead.
   */
  endTimestamp?: number;

  /**
   * @deprecated You cannot set the instrumenter manually anymore.
   */
  instrumenter?: Instrumenter;
}
