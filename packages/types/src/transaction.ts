import { SpanContext } from './span';

/**
 * JSDoc TODO
 */
export interface TransactionContext extends SpanContext {
  name: string;
}

/**
 * JSDoc TODO
 */
export interface Transaction extends TransactionContext {
  /**
   * JSDoc TODO
   */
  setName(name: string): void;
}
