import { getCurrentHub, Hub } from '@sentry/hub';
import {
  Baggage,
  Event,
  Measurements,
  Transaction as TransactionInterface,
  TransactionContext,
  TransactionMetadata,
} from '@sentry/types';
import {
  createBaggage,
  dropUndefinedKeys,
  isBaggageMutable,
  isSentryBaggageEmpty,
  logger,
  setBaggageImmutable,
  setBaggageValue,
} from '@sentry/utils';

import { Span as SpanClass, SpanRecorder } from './span';

/** JSDoc */
export class Transaction extends SpanClass implements TransactionInterface {
  public name: string;

  public metadata: TransactionMetadata;

  /**
   * The reference to the current hub.
   */
  public readonly _hub: Hub;

  private _measurements: Measurements = {};

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

    this._hub = hub || getCurrentHub();

    this.name = transactionContext.name || '';

    this.metadata = transactionContext.metadata || {};
    this._trimEnd = transactionContext.trimEnd;

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
   * @inheritDoc
   */
  public setMeasurement(name: string, value: number, unit: string = ''): void {
    this._measurements[name] = { value, unit };
  }

  /**
   * Set metadata for this transaction.
   * @hidden
   */
  public setMetadata(newMetadata: TransactionMetadata): void {
    this.metadata = { ...this.metadata, ...newMetadata };
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
      __DEBUG_BUILD__ && logger.warn('Transaction has no name, falling back to `<unlabeled transaction>`.');
      this.name = '<unlabeled transaction>';
    }

    // just sets the end timestamp
    super.finish(endTimestamp);

    if (this.sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      __DEBUG_BUILD__ && logger.log('[Tracing] Discarding transaction because its trace was not chosen to be sampled.');

      const client = this._hub.getClient();
      if (client) {
        client.recordDroppedEvent('sample_rate', 'transaction');
      }

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
      sdkProcessingMetadata: {
        ...this.metadata,
        baggage: this.getBaggage(),
      },
    };

    const hasMeasurements = Object.keys(this._measurements).length > 0;

    if (hasMeasurements) {
      __DEBUG_BUILD__ &&
        logger.log(
          '[Measurements] Adding measurements to transaction',
          JSON.stringify(this._measurements, undefined, 2),
        );
      transaction.measurements = this._measurements;
    }

    __DEBUG_BUILD__ && logger.log(`[Tracing] Finishing ${this.op} transaction: ${this.name}.`);

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
   * @inheritdoc
   */
  public getBaggage(): Baggage {
    const existingBaggage = this.metadata.baggage;

    // Only add Sentry baggage items to baggage, if baggage does not exist yet or it is still
    // empty and mutable
    // TODO: we might want to ditch the isSentryBaggageEmpty condition because it prevents
    //       custom sentry-values in DSC (added by users in the future)
    const finalBaggage =
      !existingBaggage || (isBaggageMutable(existingBaggage) && isSentryBaggageEmpty(existingBaggage))
        ? this._populateBaggageWithSentryValues(existingBaggage)
        : existingBaggage;

    // In case, we poulated the DSC, we have update the stored one on the transaction.
    if (existingBaggage !== finalBaggage) {
      this.metadata.baggage = finalBaggage;
    }

    return finalBaggage;
  }

  /**
   * Collects and adds data to the passed baggage object.
   *
   * Note: This function does not explicitly check if the passed baggage object is allowed
   * to be modified. Implicitly, `setBaggageValue` will not make modification to the object
   * if it was already set immutable.
   *
   * After adding the data, the baggage object is set immutable to prevent further modifications.
   *
   * @param baggage
   *
   * @returns modified and immutable baggage object
   */
  private _populateBaggageWithSentryValues(baggage: Baggage = createBaggage({})): Baggage {
    const hub: Hub = this._hub || getCurrentHub();
    const client = hub && hub.getClient();

    const { environment, release } = (client && client.getOptions()) || {};
    const { publicKey } = (client && client.getDsn()) || {};

    const sampleRate = this.metadata && this.metadata.transactionSampling && this.metadata.transactionSampling.rate;
    const traceId = this.traceId;
    const transactionName = this.name;

    let userId, userSegment;
    hub.configureScope(scope => {
      const { id, segment } = scope.getUser() || {};
      userId = id;
      userSegment = segment;
    });

    environment && setBaggageValue(baggage, 'environment', environment);
    release && setBaggageValue(baggage, 'release', release);
    transactionName && setBaggageValue(baggage, 'transaction', transactionName);
    userId && setBaggageValue(baggage, 'userid', userId);
    userSegment && setBaggageValue(baggage, 'usersegment', userSegment);
    sampleRate &&
      setBaggageValue(
        baggage,
        'samplerate',
        // This will make sure that expnent notation (e.g. 1.45e-14) is converted to simple decimal representation
        // Another edge case would be something like Number.NEGATIVE_INFINITY in which case we could still
        // add something like .replace(/-?∞/, '0'). For the sake of saving bytes, I'll not add this until
        // it becomes a problem
        sampleRate.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 16 }),
      );
    publicKey && setBaggageValue(baggage, 'publickey', publicKey);
    traceId && setBaggageValue(baggage, 'traceid', traceId);

    setBaggageImmutable(baggage);

    return baggage;
  }
}
