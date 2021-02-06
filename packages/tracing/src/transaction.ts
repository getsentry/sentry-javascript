import { getCurrentHub, Hub } from '@sentry/hub';
import { DebugMeta, Event, Measurements, Transaction as TransactionInterface, TransactionContext } from '@sentry/types';
import { dropUndefinedKeys, isInstanceOf, logger } from '@sentry/utils';

import { Span as SpanClass, SpanRecorder } from './span';
import { computeTracestateValue } from './utils';

type TransactionMetadata = Pick<DebugMeta, 'transactionSampling' | 'tracestate'>;

/** JSDoc */
export class Transaction extends SpanClass implements TransactionInterface {
  public name: string;

  public readonly tracestate: string;

  private _metadata: TransactionMetadata = {};

  private _measurements: Measurements = {};

  /**
   * The reference to the current hub.
   */
  private readonly _hub: Hub = (getCurrentHub() as unknown) as Hub;

  private _trimEnd?: boolean;

  /**
   * This constructor should never be called manually. Those instrumenting tracing should use
   * `Sentry.startTransaction()`, and internal methods should use `hub.startTransaction()`.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(transactionContext: TransactionContext, hub?: Hub) {
    super(transactionContext);

    if (isInstanceOf(hub, Hub)) {
      this._hub = hub as Hub;
    }

    this.name = transactionContext.name || '';

    this._trimEnd = transactionContext.trimEnd;

    // _getNewTracestate only returns undefined in the absence of a client or dsn, in which case it doesn't matter what
    // the header values are - nothing can be sent anyway - so the third alternative here is just to make TS happy
    this.tracestate = transactionContext.tracestate || this._getNewTracestate() || 'things are broken';

    // this is because transactions are also spans, and spans have a transaction pointer
    this.transaction = this;
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
   * Set observed measurements for this transaction.
   * @hidden
   */
  public setMeasurements(measurements: Measurements): void {
    this._measurements = { ...measurements };
  }

  /**
   * Set metadata for this transaction.
   * @hidden
   */
  public setMetadata(newMetadata: TransactionMetadata): void {
    this._metadata = { ...this._metadata, ...newMetadata };
  }

  /**
   * @inheritDoc
   */
  public finish(endTimestamp?: number): string | undefined {
    // This transaction is already finished, so we should not flush it again.
    if (this.endTimestamp !== undefined) {
      return undefined;
    }

    if (!this.name) {
      logger.warn('Transaction has no name, falling back to `<unlabeled transaction>`.');
      this.name = '<unlabeled transaction>';
    }

    // just sets the end timestamp
    super.finish(endTimestamp);

    if (this.sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      logger.log('[Tracing] Discarding transaction because its trace was not chosen to be sampled.');
      return undefined;
    }

    const finishedSpans = this.spanRecorder ? this.spanRecorder.spans.filter(s => s !== this && s.endTimestamp) : [];

    if (this._trimEnd && finishedSpans.length > 0) {
      this.endTimestamp = finishedSpans.reduce((prev: SpanClass, current: SpanClass) => {
        if (prev.endTimestamp && current.endTimestamp) {
          return prev.endTimestamp > current.endTimestamp ? prev : current;
        }
        return prev;
      }).endTimestamp;
    }

    this._metadata.tracestate = this.tracestate;

    const transaction: Event = {
      contexts: {
        trace: this.getTraceContext(),
      },
      spans: finishedSpans,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.endTimestamp,
      transaction: this.name,
      type: 'transaction',
      debug_meta: this._metadata,
    };

    const hasMeasurements = Object.keys(this._measurements).length > 0;

    if (hasMeasurements) {
      logger.log('[Measurements] Adding measurements to transaction', JSON.stringify(this._measurements, undefined, 2));
      transaction.measurements = this._measurements;
    }

    return this._hub.captureEvent(transaction);
  }

  /**
   * @inheritDoc
   */
  public toContext(): TransactionContext {
    const spanContext = super.toContext();

    return dropUndefinedKeys({
      ...spanContext,
      name: this.name,
      trimEnd: this._trimEnd,
    });
  }

  /**
   * @inheritDoc
   */
  public updateWithContext(transactionContext: TransactionContext): this {
    super.updateWithContext(transactionContext);

    this.name = transactionContext.name ?? '';

    this._trimEnd = transactionContext.trimEnd;

    return this;
  }

  /**
   * Create a new tracestate header value
   *
   * @returns The new tracestate value, or undefined if there's no client or no dsn
   */
  private _getNewTracestate(): string | undefined {
    const client = this._hub.getClient();
    const dsn = client?.getDsn();

    if (!client || !dsn) {
      return;
    }

    const { environment, release } = client.getOptions() || {};

    // TODO - the only reason we need the non-null assertion on `dsn.publicKey` (below) is because `dsn.publicKey` has
    // to be optional while we transition from `dsn.user` -> `dsn.publicKey`. Once `dsn.user` is removed, we can make
    // `dsn.publicKey` required and remove the `!`.

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return computeTracestateValue({ trace_id: this.traceId, environment, release, public_key: dsn.publicKey! });
  }
}
