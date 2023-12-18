/* eslint-disable max-lines */
import type { TransactionContext } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import type { Hub } from '../hub';
import type { Span } from './span';
import { SpanRecorder } from './span';
import { Transaction } from './transaction';

export const TRACING_DEFAULTS = {
  idleTimeout: 1000,
  finalTimeout: 30000,
  heartbeatInterval: 5000,
};

const FINISH_REASON_TAG = 'finishReason';

const IDLE_TRANSACTION_FINISH_REASONS = [
  'heartbeatFailed',
  'idleTimeout',
  'documentHidden',
  'finalTimeout',
  'externalFinish',
  'cancelled',
];

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
        span.endTimestamp = typeof endTimestamp === 'number' ? endTimestamp : timestampInSeconds();
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
  public activities: Record<string, boolean>;
  // Track state of activities in previous heartbeat
  private _prevHeartbeatString: string | undefined;

  // Amount of times heartbeat has counted. Will cause transaction to finish after 3 beats.
  private _heartbeatCounter: number;

  // We should not use heartbeat if we finished a transaction
  private _finished: boolean;

  // Idle timeout was canceled and we should finish the transaction with the last span end.
  private _idleTimeoutCanceledPermanently: boolean;

  private readonly _beforeFinishCallbacks: BeforeFinishCallback[];

  /**
   * Timer that tracks Transaction idleTimeout
   */
  private _idleTimeoutID: ReturnType<typeof setTimeout> | undefined;

  private _finishReason: (typeof IDLE_TRANSACTION_FINISH_REASONS)[number];

  public constructor(
    transactionContext: TransactionContext,
    private readonly _idleHub: Hub,
    /**
     * The time to wait in ms until the idle transaction will be finished. This timer is started each time
     * there are no active spans on this transaction.
     */
    private readonly _idleTimeout: number = TRACING_DEFAULTS.idleTimeout,
    /**
     * The final value in ms that a transaction cannot exceed
     */
    private readonly _finalTimeout: number = TRACING_DEFAULTS.finalTimeout,
    private readonly _heartbeatInterval: number = TRACING_DEFAULTS.heartbeatInterval,
    // Whether or not the transaction should put itself on the scope when it starts and pop itself off when it ends
    private readonly _onScope: boolean = false,
  ) {
    super(transactionContext, _idleHub);

    this.activities = {};
    this._heartbeatCounter = 0;
    this._finished = false;
    this._idleTimeoutCanceledPermanently = false;
    this._beforeFinishCallbacks = [];
    this._finishReason = IDLE_TRANSACTION_FINISH_REASONS[4];

    if (_onScope) {
      // We set the transaction here on the scope so error events pick up the trace
      // context and attach it to the error.
      DEBUG_BUILD && logger.log(`Setting idle transaction on scope. Span ID: ${this.spanId}`);
      _idleHub.getScope().setSpan(this);
    }

    this._restartIdleTimeout();
    setTimeout(() => {
      if (!this._finished) {
        this.setStatus('deadline_exceeded');
        this._finishReason = IDLE_TRANSACTION_FINISH_REASONS[3];
        this.finish();
      }
    }, this._finalTimeout);
  }

  /** {@inheritDoc} */
  public finish(endTimestamp: number = timestampInSeconds()): string | undefined {
    this._finished = true;
    this.activities = {};

    if (this.op === 'ui.action.click') {
      this.setTag(FINISH_REASON_TAG, this._finishReason);
    }

    if (this.spanRecorder) {
      DEBUG_BUILD &&
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
          DEBUG_BUILD &&
            logger.log('[Tracing] cancelling span since transaction ended early', JSON.stringify(span, undefined, 2));
        }

        const spanStartedBeforeTransactionFinish = span.startTimestamp < endTimestamp;

        // Add a delta with idle timeout so that we prevent false positives
        const timeoutWithMarginOfError = (this._finalTimeout + this._idleTimeout) / 1000;
        const spanEndedBeforeFinalTimeout = span.endTimestamp - this.startTimestamp < timeoutWithMarginOfError;

        if (DEBUG_BUILD) {
          const stringifiedSpan = JSON.stringify(span, undefined, 2);
          if (!spanStartedBeforeTransactionFinish) {
            logger.log('[Tracing] discarding Span since it happened after Transaction was finished', stringifiedSpan);
          } else if (!spanEndedBeforeFinalTimeout) {
            logger.log('[Tracing] discarding Span since it finished after Transaction final timeout', stringifiedSpan);
          }
        }

        return spanStartedBeforeTransactionFinish && spanEndedBeforeFinalTimeout;
      });

      DEBUG_BUILD && logger.log('[Tracing] flushing IdleTransaction');
    } else {
      DEBUG_BUILD && logger.log('[Tracing] No active IdleTransaction');
    }

    // if `this._onScope` is `true`, the transaction put itself on the scope when it started
    if (this._onScope) {
      const scope = this._idleHub.getScope();
      if (scope.getTransaction() === this) {
        scope.setSpan(undefined);
      }
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
      DEBUG_BUILD && logger.log('Starting heartbeat');
      this._pingHeartbeat();
    }
    this.spanRecorder.add(this);
  }

  /**
   * Cancels the existing idle timeout, if there is one.
   * @param restartOnChildSpanChange Default is `true`.
   *                                 If set to false the transaction will end
   *                                 with the last child span.
   */
  public cancelIdleTimeout(
    endTimestamp?: Parameters<IdleTransaction['finish']>[0],
    {
      restartOnChildSpanChange,
    }: {
      restartOnChildSpanChange?: boolean;
    } = {
      restartOnChildSpanChange: true,
    },
  ): void {
    this._idleTimeoutCanceledPermanently = restartOnChildSpanChange === false;
    if (this._idleTimeoutID) {
      clearTimeout(this._idleTimeoutID);
      this._idleTimeoutID = undefined;

      if (Object.keys(this.activities).length === 0 && this._idleTimeoutCanceledPermanently) {
        this._finishReason = IDLE_TRANSACTION_FINISH_REASONS[5];
        this.finish(endTimestamp);
      }
    }
  }

  /**
   * Temporary method used to externally set the transaction's `finishReason`
   *
   * ** WARNING**
   * This is for the purpose of experimentation only and will be removed in the near future, do not use!
   *
   * @internal
   *
   */
  public setFinishReason(reason: string): void {
    this._finishReason = reason;
  }

  /**
   * Restarts idle timeout, if there is no running idle timeout it will start one.
   */
  private _restartIdleTimeout(endTimestamp?: Parameters<IdleTransaction['finish']>[0]): void {
    this.cancelIdleTimeout();
    this._idleTimeoutID = setTimeout(() => {
      if (!this._finished && Object.keys(this.activities).length === 0) {
        this._finishReason = IDLE_TRANSACTION_FINISH_REASONS[1];
        this.finish(endTimestamp);
      }
    }, this._idleTimeout);
  }

  /**
   * Start tracking a specific activity.
   * @param spanId The span id that represents the activity
   */
  private _pushActivity(spanId: string): void {
    this.cancelIdleTimeout(undefined, { restartOnChildSpanChange: !this._idleTimeoutCanceledPermanently });
    DEBUG_BUILD && logger.log(`[Tracing] pushActivity: ${spanId}`);
    this.activities[spanId] = true;
    DEBUG_BUILD && logger.log('[Tracing] new activities count', Object.keys(this.activities).length);
  }

  /**
   * Remove an activity from usage
   * @param spanId The span id that represents the activity
   */
  private _popActivity(spanId: string): void {
    if (this.activities[spanId]) {
      DEBUG_BUILD && logger.log(`[Tracing] popActivity ${spanId}`);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.activities[spanId];
      DEBUG_BUILD && logger.log('[Tracing] new activities count', Object.keys(this.activities).length);
    }

    if (Object.keys(this.activities).length === 0) {
      const endTimestamp = timestampInSeconds();
      if (this._idleTimeoutCanceledPermanently) {
        this._finishReason = IDLE_TRANSACTION_FINISH_REASONS[5];
        this.finish(endTimestamp);
      } else {
        // We need to add the timeout here to have the real endtimestamp of the transaction
        // Remember timestampInSeconds is in seconds, timeout is in ms
        this._restartIdleTimeout(endTimestamp + this._idleTimeout / 1000);
      }
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
      DEBUG_BUILD && logger.log('[Tracing] Transaction finished because of no change for 3 heart beats');
      this.setStatus('deadline_exceeded');
      this._finishReason = IDLE_TRANSACTION_FINISH_REASONS[0];
      this.finish();
    } else {
      this._pingHeartbeat();
    }
  }

  /**
   * Pings the heartbeat
   */
  private _pingHeartbeat(): void {
    DEBUG_BUILD && logger.log(`pinging Heartbeat -> current counter: ${this._heartbeatCounter}`);
    setTimeout(() => {
      this._beat();
    }, this._heartbeatInterval);
  }
}
