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
}
