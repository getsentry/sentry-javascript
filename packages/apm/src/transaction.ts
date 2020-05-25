// tslint:disable:max-classes-per-file
import { getCurrentHub, Hub } from '@sentry/hub';
import { TransactionContext } from '@sentry/types';
import { isInstanceOf, logger } from '@sentry/utils';

import { Span as SpanClass } from './span';

/**
 * Keeps track of finished spans for a given transaction
 * @internal
 * @hideconstructor
 * @hidden
 */
export class SpanRecorder {
  private readonly _maxlen: number;
  public spans: SpanClass[] = [];

  public constructor(maxlen: number = 1000) {
    this._maxlen = maxlen;
  }

  /**
   * This is just so that we don't run out of memory while recording a lot
   * of spans. At some point we just stop and flush out the start of the
   * trace tree (i.e.the first n spans with the smallest
   * start_timestamp).
   */
  public add(span: SpanClass): void {
    if (this.spans.length > this._maxlen) {
      span.spanRecorder = undefined;
    } else {
      this.spans.push(span);
    }
  }
}

/** JSDoc */
export class Transaction extends SpanClass {
  /**
   * The reference to the current hub.
   */
  private readonly _hub: Hub = (getCurrentHub() as unknown) as Hub;

  public name?: string;

  /**
   * This constructor should never be called manually. Those instrumenting tracing should use `Stentry.startTransaction()`, and internal methods should use `hub.startSpan()`.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(transactionContext: TransactionContext, hub?: Hub) {
    super(transactionContext);

    if (isInstanceOf(hub, Hub)) {
      this._hub = hub as Hub;
    }

    if (transactionContext.name) {
      this.name = transactionContext.name;
    }
  }

  /**
   * JSDoc
   */
  public setName(name: string): void {
    this.name = name;
  }

  /**
   * Attaches SpanRecorder to the span itself
   * @param maxlen maximum number of spans that can be recorded
   */
  public initSpanRecorder(maxlen: number = 1000): void {
    if (!this.spanRecorder) {
      this.spanRecorder = new SpanRecorder(maxlen);
    }
    this.spanRecorder.add(this);
  }

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
  public finish(endTimestamp?: number, trimEnd: boolean = false): string | undefined {
    // This transaction is already finished, so we should not flush it again.
    if (this.endTimestamp !== undefined) {
      return undefined;
    }

    super.finish(endTimestamp);

    if (this.sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      logger.warn('Discarding transaction because it was not chosen to be sampled.');
      return undefined;
    }

    const finishedSpans = this.spanRecorder ? this.spanRecorder.spans.filter(s => s !== this && s.endTimestamp) : [];

    if (trimEnd && finishedSpans.length > 0) {
      this.endTimestamp = finishedSpans.reduce((prev: SpanClass, current: SpanClass) => {
        if (prev.endTimestamp && current.endTimestamp) {
          return prev.endTimestamp > current.endTimestamp ? prev : current;
        }
        return prev;
      }).endTimestamp;
    }

    return this._hub.captureEvent({
      contexts: {
        trace: this.getTraceContext(),
      },
      spans: finishedSpans,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.endTimestamp,
      transaction: this.name,
      type: 'transaction',
    });
  }
}
