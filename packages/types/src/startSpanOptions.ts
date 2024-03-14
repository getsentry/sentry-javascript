import type { Scope } from './scope';
import type { SpanAttributes, SpanTimeInput } from './span';

export interface StartSpanOptions {
  /** A manually specified start time for the created `Span` object. */
  startTime?: SpanTimeInput;

  /** If defined, start this span off this scope instead off the current scope. */
  scope?: Scope;

  /** The name of the span. */
  name: string;

  /** If set to true, only start a span if a parent span exists. */
  onlyIfParent?: boolean;

  /** An op for the span. This is a categorization for spans. */
  op?: string;

  /**
   * If set to true, this span will be forced to be treated as a transaction in the Sentry UI, if possible and applicable.
   * Note that it is up to the SDK to decide how exactly the span will be sent, which may change in future SDK versions.
   * It is not guaranteed that a span started with this flag set to `true` will be sent as a transaction.
   */
  forceTransaction?: boolean;

  /** Attributes for the span. */
  attributes?: SpanAttributes;
}
