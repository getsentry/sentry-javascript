import { Span, SpanContext } from './span';

/**
 * JSDoc TODO
 */
export interface TransactionContext extends SpanContext {
  name: string;
}

/**
 * JSDoc TODO
 */
export interface Transaction extends TransactionContext, Span {
  /**
   * JSDoc TODO
   */
  setName(name: string): void;
}
