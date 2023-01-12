/* eslint-disable max-lines */
import type { Hub } from '@sentry/core';
import type { TransactionContext } from '@sentry/types';
import { logger, timestampWithMs } from '@sentry/utils';

import type { Span } from './span';
import { SpanRecorder } from './span';
import { Transaction } from './transaction';

export const DEFAULT_IDLE_TIMEOUT = 1000;
export const DEFAULT_FINAL_TIMEOUT = 30000;
export const DEFAULT_HEARTBEAT_INTERVAL = 5000;

/**
 * @inheritDoc
 */
export class IdleTransactionSpanRecorder extends SpanRecorder {
  public constructor(
    private readonly _pushActivity: (id: string) => void,
    private readonly _popActivity: (id: string) => void,
    public transactionSpanId: string,
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

  // Track state of activities in previous heartbeat
  private _prevHeartbeatString: string | undefined;

  // Amount of times heartbeat has counted. Will cause transaction to finish after 3 beats.
  private _heartbeatCounter: number = 0;

  // We should not use heartbeat if we finished a transaction
  private _finished: boolean = false;

  private readonly _beforeFinishCallbacks: BeforeFinishCallback[] = [];

  /**
   * Timer that tracks Transaction idleTimeout
   */
  private _idleTimeoutID: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    transactionContext: TransactionContext,
    private readonly _idleHub: Hub,
    /**
     * The time to wait in ms until the idle transaction will be finished. This timer is started each time
     * there are no active spans on this transaction.
     */
    private readonly _idleTimeout: number = DEFAULT_IDLE_TIMEOUT,
    /**
     * The final value in ms that a transaction cannot exceed
     */
    private readonly _finalTimeout: number = DEFAULT_FINAL_TIMEOUT,
    private readonly _heartbeatInterval: number = DEFAULT_HEARTBEAT_INTERVAL,
    // Whether or not the transaction should put itself on the scope when it starts and pop itself off when it ends
    private readonly _onScope: boolean = false,
  ) {
    super(transactionContext, _idleHub);

    if (_onScope) {
      // There should only be one active transaction on the scope
      clearActiveTransaction(_idleHub);

      // We set the transaction here on the scope so error events pick up the trace
      // context and attach it to the error.
      __DEBUG_BUILD__ && logger.log(`Setting idle transaction on scope. Span ID: ${this.spanId}`);
      _idleHub.configureScope(scope => scope.setSpan(this));
    }

    this._startIdleTimeout();
    setTimeout(() => {
      if (!this._finished) {
        this.setStatus('deadline_exceeded');
        this.finish();
      }
    }, this._finalTimeout);
  }

  /** {@inheritDoc} */
  public finish(endTimestamp: number = timestampWithMs()): string | undefined {
    this._finished = true;
    this.activities = {};

    if (this.spanRecorder) {
      __DEBUG_BUILD__ &&
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
          __DEBUG_BUILD__ &&
            logger.log('[Tracing] cancelling span since transaction ended early', JSON.stringify(span, undefined, 2));
        }

        const keepSpan = span.startTimestamp < endTimestamp;
        if (!keepSpan) {
          __DEBUG_BUILD__ &&
            logger.log(
              '[Tracing] discarding Span since it happened after Transaction was finished',
              JSON.stringify(span, undefined, 2),
            );
        }
        return keepSpan;
      });

      __DEBUG_BUILD__ && logger.log('[Tracing] flushing IdleTransaction');
    } else {
      __DEBUG_BUILD__ && logger.log('[Tracing] No active IdleTransaction');
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
      const pushActivity = (id: string): void => {
        if (this._finished) {
          return;
        }
        this._pushActivity(id);
      };
      const popActivity = (id: string): void => {
        if (this._finished) {
          return;
        }
        this._popActivity(id);
      };

      this.spanRecorder = new IdleTransactionSpanRecorder(pushActivity, popActivity, this.spanId, maxlen);

      // Start heartbeat so that transactions do not run forever.
      __DEBUG_BUILD__ && logger.log('Starting heartbeat');
      this._pingHeartbeat();
    }
    this.spanRecorder.add(this);
  }

  /**
   * Cancels the existing idletimeout, if there is one
   */
  private _cancelIdleTimeout(): void {
    if (this._idleTimeoutID) {
      clearTimeout(this._idleTimeoutID);
      this._idleTimeoutID = undefined;
    }
  }

  /**
   * Creates an idletimeout
   */
  private _startIdleTimeout(endTimestamp?: Parameters<IdleTransaction['finish']>[0]): void {
    this._cancelIdleTimeout();
    this._idleTimeoutID = setTimeout(() => {
      if (!this._finished && Object.keys(this.activities).length === 0) {
        this.finish(endTimestamp);
      }
    }, this._idleTimeout);
  }

  /**
   * Start tracking a specific activity.
   * @param spanId The span id that represents the activity
   */
  private _pushActivity(spanId: string): void {
    this._cancelIdleTimeout();
    __DEBUG_BUILD__ && logger.log(`[Tracing] pushActivity: ${spanId}`);
    this.activities[spanId] = true;
    __DEBUG_BUILD__ && logger.log('[Tracing] new activities count', Object.keys(this.activities).length);
  }

  /**
   * Remove an activity from usage
   * @param spanId The span id that represents the activity
   */
  private _popActivity(spanId: string): void {
    if (this.activities[spanId]) {
      __DEBUG_BUILD__ && logger.log(`[Tracing] popActivity ${spanId}`);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.activities[spanId];
      __DEBUG_BUILD__ && logger.log('[Tracing] new activities count', Object.keys(this.activities).length);
    }

    if (Object.keys(this.activities).length === 0) {
      // We need to add the timeout here to have the real endtimestamp of the transaction
      // Remember timestampWithMs is in seconds, timeout is in ms
      const endTimestamp = timestampWithMs() + this._idleTimeout / 1000;
      this._startIdleTimeout(endTimestamp);
    }
  }

  /**
   * Checks when entries of this.activities are not changing for 3 beats.
   * If this occurs we finish the transaction.
   */
  private _beat(): void {
    // We should not be running heartbeat if the idle transaction is finished.
    if (this._finished) {
      return;
    }

    const heartbeatString = Object.keys(this.activities).join('');

    if (heartbeatString === this._prevHeartbeatString) {
      this._heartbeatCounter++;
    } else {
      this._heartbeatCounter = 1;
    }

    this._prevHeartbeatString = heartbeatString;

    if (this._heartbeatCounter >= 3) {
      __DEBUG_BUILD__ && logger.log('[Tracing] Transaction finished because of no change for 3 heart beats');
      this.setStatus('deadline_exceeded');
      this.finish();
    } else {
      this._pingHeartbeat();
    }
  }

  /**
   * Pings the heartbeat
   */
  private _pingHeartbeat(): void {
    __DEBUG_BUILD__ && logger.log(`pinging Heartbeat -> current counter: ${this._heartbeatCounter}`);
    setTimeout(() => {
      this._beat();
    }, this._heartbeatInterval);
  }
}

/**
 * Reset transaction on scope to `undefined`
 */
function clearActiveTransaction(hub: Hub): void {
  const scope = hub.getScope();
  if (scope) {
    const transaction = scope.getTransaction();
    if (transaction) {
      scope.setSpan(undefined);
    }
  }
}
