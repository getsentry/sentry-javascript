import { Span, SpanContext } from './span';

/**
 * Interface holding Transaction specific properties
 */
export interface TransactionContext extends SpanContext {
  name: string;
}

/**
 * Transaction "Class", inherits Span only has `setName`
 */
export interface Transaction extends TransactionContext, Span {
  /**
   * Set the name of the transaction
   */
  setName(name: string): void;

  /**
   * Sets the finish timestamp on the current span.
   *
   * @inheritdoc
   *
   * @param trimEnd If true, sets the end timestamp of the transaction to the highest timestamp of child spans, trimming
   * the duration of the transaction. This is useful to discard extra time in the transaction that is not
   * accounted for in child spans, like what happens in the idle transaction Tracing integration, where we finish the
   * transaction after a given "idle time" and we don't want this "idle time" to be part of the transaction.
   */
  finish(endTimestamp?: number, trimEnd?: boolean): string | undefined;
}
