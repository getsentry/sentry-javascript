import { Span, SpanContext } from './span';

/**
 * Interface holding Transaction specific properties
 */
export interface TransactionContext extends SpanContext {
  name: string;
  /**
   * If true, sets the end timestamp of the transaction to the highest timestamp of child spans, trimming
   * the duration of the transaction. This is useful to discard extra time in the transaction that is not
   * accounted for in child spans, like what happens in the idle transaction Tracing integration, where we finish the
   * transaction after a given "idle time" and we don't want this "idle time" to be part of the transaction.
   */
  trimEnd?: boolean;

  /**
   * This flag is internally used by {@link Sentry.startTransaction} and set there to determine this is really a
   * Transaction. Since there is no type safety in JS we set it in the top level function to true to check later
   * if the user really wanted to create a Transaction and we can log a warning if they forgot to set the name property.
   */
  _isTransaction?: boolean;
}

/**
 * Transaction "Class", inherits Span only has `setName`
 */
export interface Transaction extends TransactionContext, Span {
  /**
   * @inheritDoc
   */
  spanId: string;

  /**
   * @inheritDoc
   */
  traceId: string;

  /**
   * @inheritDoc
   */
  startTimestamp: number;

  /**
   * @inheritDoc
   */
  tags: { [key: string]: string };

  /**
   * @inheritDoc
   */
  data: { [key: string]: any };

  /**
   * Set the name of the transaction
   */
  setName(name: string): void;
}
