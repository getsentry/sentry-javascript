import { Hub } from '@sentry/hub';
import { TransactionContext } from '@sentry/types';
import { logger, timestampWithMs } from '@sentry/utils';

import { FINISH_REASON_TAG, IDLE_TRANSACTION_FINISH_REASONS } from './constants';
import { Span, SpanRecorder } from './span';
import { Transaction } from './transaction';

export const DEFAULT_IDLE_TIMEOUT = 1000;
export const HEARTBEAT_INTERVAL = 5000;

/**
 * @inheritDoc
 */
export class IdleTransactionSpanRecorder extends SpanRecorder {
  public constructor(
    private readonly _pushActivity: (id: string) => void,
    private readonly _popActivity: (id: string) => void,
    public transactionSpanId: string = '',
    maxlen?: number,
  ) {
    super(maxlen);
  }

  /**
   * @inheritDoc
   */
  public add(span: Span): void {
    // We should make sure we do not push and pop activities for
    // the transaction that this span recorder belongs to.
    if (span.spanId !== this.transactionSpanId) {
      // We patch span.finish() to pop an activity after setting an endTimestamp.
      span.finish = (endTimestamp?: number) => {
        span.endTimestamp = typeof endTimestamp === 'number' ? endTimestamp : timestampWithMs();
        this._popActivity(span.spanId);
      };

      // We should only push new activities if the span does not have an end timestamp.
      if (span.endTimestamp === undefined) {
        this._pushActivity(span.spanId);
      }
    }

    super.add(span);
  }
}

export type BeforeFinishCallback = (transactionSpan: IdleTransaction, endTimestamp: number) => void;

/**
 * An IdleTransaction is a transaction that automatically finishes. It does this by tracking child spans as activities.
 * You can have multiple IdleTransactions active, but if the `onScope` option is specified, the idle transaction will
 * put itself on the scope on creation.
 */
export class IdleTransaction extends Transaction {
  // Activities store a list of active spans
  public activities: Record<string, boolean> = {};

  private readonly _beforeFinishCallbacks: BeforeFinishCallback[] = [];

  /**
   * If a transaction is created and no activities are added, we want to make sure that
   * it times out properly. This is cleared and not used when activities are added.
   */
  private _initTimeout: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    transactionContext: TransactionContext,
    private readonly _idleHub?: Hub,
    /**
     * The time to wait in ms until the idle transaction will be finished.
     * @default 1000
     */
    private readonly _idleTimeout: number = DEFAULT_IDLE_TIMEOUT,
    // Whether or not the transaction should put itself on the scope when it starts and pop itself off when it ends
    private readonly _onScope: boolean = false,
  ) {
    super(transactionContext, _idleHub);

    if (_idleHub && _onScope) {
      // There should only be one active transaction on the scope
      clearActiveTransaction(_idleHub);

      // We set the transaction here on the scope so error events pick up the trace
      // context and attach it to the error.
      logger.log(`Setting idle transaction on scope. Span ID: ${this.spanId}`);
      _idleHub.configureScope(scope => scope.setSpan(this));
    }

    this._initTimeout = setTimeout(() => {
      this.finish();
    }, this._idleTimeout);
  }

  /** {@inheritDoc} */
  public finish(endTimestamp: number = timestampWithMs()): string | undefined {
    this.activities = {};

    if (this.spanRecorder) {
      logger.log('[Tracing] finishing IdleTransaction', new Date(endTimestamp * 1000).toISOString(), this.op);

      for (const callback of this._beforeFinishCallbacks) {
        callback(this, endTimestamp);
      }

      this.spanRecorder.spans = this.spanRecorder.spans.filter((span: Span) => {
        // If we are dealing with the transaction itself, we just return it
        if (span.spanId === this.spanId) {
          return true;
        }

        // We cancel all pending spans with status "cancelled" to indicate the idle transaction was finished early
        if (!span.endTimestamp) {
          span.endTimestamp = endTimestamp;
          span.setStatus('cancelled');
          logger.log('[Tracing] cancelling span since transaction ended early', JSON.stringify(span, undefined, 2));
        }

        const keepSpan = span.startTimestamp < endTimestamp;
        if (!keepSpan) {
          logger.log(
            '[Tracing] discarding Span since it happened after Transaction was finished',
            JSON.stringify(span, undefined, 2),
          );
        }
        return keepSpan;
      });

      logger.log('[Tracing] flushing IdleTransaction');
    } else {
      logger.log('[Tracing] No active IdleTransaction');
    }

    // if `this._onScope` is `true`, the transaction put itself on the scope when it started
    if (this._onScope) {
      clearActiveTransaction(this._idleHub);
    }

    return super.finish(endTimestamp);
  }

  /**
   * Register a callback function that gets excecuted before the transaction finishes.
   * Useful for cleanup or if you want to add any additional spans based on current context.
   *
   * This is exposed because users have no other way of running something before an idle transaction
   * finishes.
   */
  public registerBeforeFinishCallback(callback: BeforeFinishCallback): void {
    this._beforeFinishCallbacks.push(callback);
  }

  /**
   * @inheritDoc
   */
  public initSpanRecorder(maxlen?: number): void {
    if (!this.spanRecorder) {
      this.spanRecorder = new IdleTransactionSpanRecorder(this._pushActivity.bind(this), this._popActivity.bind(this), this.spanId, maxlen);
    }
    this.spanRecorder.add(this);
  }

  /**
   * Start tracking a specific activity.
   * @param spanId The span id that represents the activity
   */
  private _pushActivity(spanId: string): void {
    if (this._initTimeout) {
      clearTimeout(this._initTimeout);
      this._initTimeout = undefined;
    }
    logger.log(`[Tracing] pushActivity: ${spanId}`);
    this.activities[spanId] = true;
    logger.log('[Tracing] new activities count', Object.keys(this.activities).length);
  }

  /**
   * Remove an activity from usage
   * @param spanId The span id that represents the activity
   */
  private _popActivity(spanId: string): void {
    if (this.activities[spanId]) {
      logger.log(`[Tracing] popActivity ${spanId}`);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.activities[spanId];
      logger.log('[Tracing] new activities count', Object.keys(this.activities).length);
    }

    if (Object.keys(this.activities).length === 0) {
      const timeout = this._idleTimeout;
      // We need to add the timeout here to have the real endtimestamp of the transaction
      // Remember timestampWithMs is in seconds, timeout is in ms
      const end = timestampWithMs() + timeout / 1000;

      setTimeout(() => {
        this.setTag(FINISH_REASON_TAG, IDLE_TRANSACTION_FINISH_REASONS[1]);
        this.finish(end);
      }, timeout);
    }
  }
}

/**
 * Reset transaction on scope to `undefined`
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
