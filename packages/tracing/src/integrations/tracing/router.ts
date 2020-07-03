import { Hub } from '@sentry/hub';
import { TransactionContext } from '@sentry/types';
import { addInstrumentationHandler, getGlobalObject, logger, timestampWithMs } from '@sentry/utils';

import { IdleTransaction } from '../../idletransaction';

import { Location as LocationType } from './types';

const global = getGlobalObject<Window>();

/**
 * Options for RoutingInstrumentation
 */
export interface RoutingInstrumentationOptions {
  /**
   * The time to wait in ms until the transaction will be finished. The transaction will use the end timestamp of
   * the last finished span as the endtime for the transaction.
   * Time is in ms.
   *
   * Default: 1000
   */
  idleTimeout: number;

  /**
   * Flag to enable/disable creation of `navigation` transaction on history changes. Useful for react applications with
   * a router.
   *
   * Default: true
   */
  startTransactionOnLocationChange: boolean;

  /**
   * Flag to enable/disable creation of `pageload` transaction on first pageload.
   *
   * Default: true
   */
  startTransactionOnPageLoad: boolean;

  /**
   * beforeNavigate is called before a pageload/navigation transaction is created and allows for users
   * to set a custom navigation transaction name based on the current `window.location`. Defaults to returning
   * `window.location.pathname`.
   *
   * If null is returned, a pageload/navigation transaction will not be created.
   *
   * @param name the current name of the pageload/navigation transaction
   */
  beforeNavigate(location: LocationType): string | null;
}

export const defaultRoutingInstrumentationOptions: RoutingInstrumentationOptions = {
  beforeNavigate(location: LocationType): string | null {
    return location.pathname;
  },
  idleTimeout: 1000,
  startTransactionOnLocationChange: true,
  startTransactionOnPageLoad: true,
};

/**
 * Defines how to instrument routing
 */
export interface RoutingInstrumentation {
  options: Partial<RoutingInstrumentationOptions>;

  /**
   * Start recording pageload/navigation transactions
   * @param hub The hub associated with the pageload/navigation transactions
   * @param idleTimeout The timeout for the transactions
   */
  init(
    hub: Hub,
    beforeFinish?: (transactionSpan: IdleTransaction) => void,
    transactionContext?: Partial<TransactionContext>,
  ): void;

  /**
   * Start an idle transaction. Called by init().
   */
  startIdleTransaction(
    hub: Hub,
    op: string,
    transactionContext?: Partial<TransactionContext>,
  ): IdleTransaction | undefined;

  /**
   * Start a pageload transaction
   */
  startPageloadTransaction(
    hub: Hub,
    beforeFinish?: (transactionSpan: IdleTransaction) => void,
    transactionContext?: TransactionContext,
  ): void;

  /**
   * Start a navigation transaction
   */
  startNavigationTransaction(
    hub: Hub,
    beforeFinish?: (transactionSpan: IdleTransaction) => void,
    transactionContext?: TransactionContext,
  ): void;
}

export type RoutingInstrumentationClass = new (_options?: RoutingInstrumentationOptions) => RoutingInstrumentation;

/** JSDOC */
export class RouterTracing implements RoutingInstrumentation {
  /** JSDoc */
  public options: RoutingInstrumentationOptions = defaultRoutingInstrumentationOptions;

  private _activeTransaction?: IdleTransaction;

  public constructor(_options?: RoutingInstrumentationOptions) {
    this.options = {
      ...this.options,
      ..._options,
    };
  }

  /**
   * @inheritDoc
   */
  public startIdleTransaction(
    hub: Hub,
    op: string,
    transactionContext?: Partial<TransactionContext>,
  ): IdleTransaction | undefined {
    if (!global || !global.location || !hub) {
      return undefined;
    }

    const name = this.options.beforeNavigate(global.location);

    // if beforeNavigate returns null, we should not start a transaction.
    if (name === null) {
      return undefined;
    }

    this._activeTransaction = hub.startTransaction(
      {
        name,
        op,
        trimEnd: true,
        ...transactionContext,
      },
      this.options.idleTimeout,
    ) as IdleTransaction;

    return this._activeTransaction;
  }

  /**
   * @inheritDoc
   */
  public startPageloadTransaction(
    hub: Hub,
    beforeFinish?: (transactionSpan: IdleTransaction) => void,
    transactionContext?: TransactionContext,
  ): void {
    logger.log(`[Tracing] starting pageload transaction`);
    this._activeTransaction = this.startIdleTransaction(hub, 'pageload', transactionContext);
    if (this._activeTransaction && beforeFinish) {
      this._activeTransaction.beforeFinish(beforeFinish);
    }
  }

  /**
   * @inheritDoc
   */
  public startNavigationTransaction(
    hub: Hub,
    beforeFinish?: (transactionSpan: IdleTransaction) => void,
    transactionContext?: TransactionContext,
  ): void {
    if (this._activeTransaction) {
      logger.log(`[Tracing] force ending previous transaction`);
      this._activeTransaction.finishIdleTransaction(timestampWithMs());
    }
    logger.log(`[Tracing] starting navigation transaction`);
    this._activeTransaction = this.startIdleTransaction(hub, 'navigation', transactionContext);
    if (this._activeTransaction && beforeFinish) {
      this._activeTransaction.beforeFinish(beforeFinish);
    }
  }

  /**
   * @inheritDoc
   */
  public init(
    hub: Hub,
    beforeFinish?: (transactionSpan: IdleTransaction) => void,
    transactionContext?: TransactionContext,
  ): void {
    const { startTransactionOnPageLoad, startTransactionOnLocationChange } = this.options;
    if (startTransactionOnPageLoad) {
      this.startPageloadTransaction(hub, beforeFinish, transactionContext);
    }

    let startingUrl: string | undefined;
    if (global && global.location) {
      startingUrl = global.location.href;
    }

    addInstrumentationHandler({
      callback: ({ to, from }: { to: string; from?: string }) => {
        // This is to account for some cases where navigation transaction
        // starts right after long running pageload.
        if (startingUrl && from === undefined && startingUrl.indexOf(to) !== -1) {
          startingUrl = undefined;
          return;
        }
        if (startTransactionOnLocationChange && from !== to) {
          this.startNavigationTransaction(hub, beforeFinish, transactionContext);
        }
      },
      type: 'history',
    });
  }
}
