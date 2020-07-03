import { Hub } from '@sentry/hub';
import { TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { Transaction } from './transaction';

const DEFAULT_IDLE_TIMEOUT = 500;

/**
 * An IdleTransaction is a transaction that automatically finishes.
 * It tracks child spans as activities to decide when to finish.
 */
export class IdleTransaction extends Transaction {
  /**
   * Activities store a list of active spans
   *
   * TODO: Can we use `Set()` here?
   */
  public activities: Record<string, boolean> = {};

  private readonly _idleTimeout: number = DEFAULT_IDLE_TIMEOUT;
  private readonly _idleHub?: Hub;

  public constructor(transactionContext: TransactionContext, hub?: Hub, idleTimeout: number = DEFAULT_IDLE_TIMEOUT) {
    super(transactionContext, hub);
    this._idleTimeout = idleTimeout;
    this._idleHub = hub;

    if (hub) {
      // There should only be one active transaction on the scope
      clearActiveTransaction(hub);

      // We set the transaction here on the scope so error events pick up the trace
      // context and attach it to the error.
      logger.log(`Setting idle transaction on scope. Span ID: ${this.spanId}`);
      hub.configureScope(scope => scope.setSpan(this));
    }

    // Start heartbeat so that transactions do not run forever.
    logger.log('Starting heartbeat');
    // this._pingHeartbeat();
  }
}

/**
 * Reset active transaction on scope
 */
function clearActiveTransaction(hub?: Hub): void {
  if (hub) {
    const scope = hub.getScope();
    if (scope) {
      const transaction = scope.getTransaction();
      if (transaction) {
        scope.setSpan(undefined);
      }
    }
  }
}
