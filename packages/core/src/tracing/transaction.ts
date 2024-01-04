import type {
  Context,
  Contexts,
  DynamicSamplingContext,
  MeasurementUnit,
  Measurements,
  Transaction as TransactionInterface,
  TransactionContext,
  TransactionEvent,
  TransactionMetadata,
} from '@sentry/types';
import { dropUndefinedKeys, logger, timestampInSeconds } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import type { Hub } from '../hub';
import { getCurrentHub } from '../hub';
import { spanToTraceContext } from '../utils/spanUtils';
import { getDynamicSamplingContextFromClient } from './dynamicSamplingContext';
import { Span as SpanClass, SpanRecorder } from './span';
import { ensureTimestampInSeconds } from './utils';

/** JSDoc */
export class Transaction extends SpanClass implements TransactionInterface {
  public metadata: TransactionMetadata;

  /**
   * The reference to the current hub.
   */
  public _hub: Hub;

  private _name: string;

  private _measurements: Measurements;

  private _contexts: Contexts;

  private _trimEnd?: boolean;

  private _frozenDynamicSamplingContext: Readonly<Partial<DynamicSamplingContext>> | undefined;

  /**
   * This constructor should never be called manually. Those instrumenting tracing should use
   * `Sentry.startTransaction()`, and internal methods should use `hub.startTransaction()`.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(transactionContext: TransactionContext, hub?: Hub) {
    super(transactionContext);
    // We need to delete description since it's set by the Span class constructor
    // but not needed for transactions.
    delete this.description;

    this._measurements = {};
    this._contexts = {};

    this._hub = hub || getCurrentHub();

    this._name = transactionContext.name || '';

    this.metadata = {
      source: 'custom',
      ...transactionContext.metadata,
      spanMetadata: {},
    };

    this._trimEnd = transactionContext.trimEnd;

    // this is because transactions are also spans, and spans have a transaction pointer
    this.transaction = this;

    // If Dynamic Sampling Context is provided during the creation of the transaction, we freeze it as it usually means
    // there is incoming Dynamic Sampling Context. (Either through an incoming request, a baggage meta-tag, or other means)
    const incomingDynamicSamplingContext = this.metadata.dynamicSamplingContext;
    if (incomingDynamicSamplingContext) {
      // We shallow copy this in case anything writes to the original reference of the passed in `dynamicSamplingContext`
      this._frozenDynamicSamplingContext = { ...incomingDynamicSamplingContext };
    }
  }

  /** Getter for `name` property */
  public get name(): string {
    return this._name;
  }

  /**
   * Setter for `name` property, which also sets `source` as custom.
   */
  public set name(newName: string) {
    // eslint-disable-next-line deprecation/deprecation
    this.setName(newName);
  }

  /**
   * Setter for `name` property, which also sets `source` on the metadata.
   *
   * @deprecated Use `updateName()` and `setMetadata()` instead.
   */
  public setName(name: string, source: TransactionMetadata['source'] = 'custom'): void {
    this._name = name;
    this.metadata.source = source;
  }

  /** @inheritdoc */
  public updateName(name: string): this {
    this._name = name;
    return this;
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
  public setContext(key: string, context: Context | null): void {
    if (context === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this._contexts[key];
    } else {
      this._contexts[key] = context;
    }
  }

  /**
   * @inheritDoc
   */
  public setMeasurement(name: string, value: number, unit: MeasurementUnit = ''): void {
    this._measurements[name] = { value, unit };
  }

  /**
   * @inheritDoc
   */
  public setMetadata(newMetadata: Partial<TransactionMetadata>): void {
    this.metadata = { ...this.metadata, ...newMetadata };
  }

  /**
   * @inheritDoc
   */
  public end(endTimestamp?: number): string | undefined {
    const timestampInS =
      typeof endTimestamp === 'number' ? ensureTimestampInSeconds(endTimestamp) : timestampInSeconds();
    const transaction = this._finishTransaction(timestampInS);
    if (!transaction) {
      return undefined;
    }
    return this._hub.captureEvent(transaction);
  }

  /**
   * @inheritDoc
   */
  public toContext(): TransactionContext {
    // eslint-disable-next-line deprecation/deprecation
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
    // eslint-disable-next-line deprecation/deprecation
    super.updateWithContext(transactionContext);

    this.name = transactionContext.name || '';

    this._trimEnd = transactionContext.trimEnd;

    return this;
  }

  /**
   * @inheritdoc
   *
   * @experimental
   */
  public getDynamicSamplingContext(): Readonly<Partial<DynamicSamplingContext>> {
    if (this._frozenDynamicSamplingContext) {
      return this._frozenDynamicSamplingContext;
    }

    const hub = this._hub || getCurrentHub();
    const client = hub.getClient();

    if (!client) return {};

    const scope = hub.getScope();
    const dsc = getDynamicSamplingContextFromClient(this.traceId, client, scope);

    const maybeSampleRate = this.metadata.sampleRate;
    if (maybeSampleRate !== undefined) {
      dsc.sample_rate = `${maybeSampleRate}`;
    }

    // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
    const source = this.metadata.source;
    if (source && source !== 'url') {
      dsc.transaction = this.name;
    }

    if (this.sampled !== undefined) {
      dsc.sampled = String(this.sampled);
    }

    // Uncomment if we want to make DSC immutable
    // this._frozenDynamicSamplingContext = dsc;

    return dsc;
  }

  /**
   * Override the current hub with a new one.
   * Used if you want another hub to finish the transaction.
   *
   * @internal
   */
  public setHub(hub: Hub): void {
    this._hub = hub;
  }

  /**
   * Finish the transaction & prepare the event to send to Sentry.
   */
  protected _finishTransaction(endTimestamp?: number): TransactionEvent | undefined {
    // This transaction is already finished, so we should not flush it again.
    if (this.endTimestamp !== undefined) {
      return undefined;
    }

    if (!this.name) {
      DEBUG_BUILD && logger.warn('Transaction has no name, falling back to `<unlabeled transaction>`.');
      this.name = '<unlabeled transaction>';
    }

    // just sets the end timestamp
    super.end(endTimestamp);

    const client = this._hub.getClient();
    if (client && client.emit) {
      client.emit('finishTransaction', this);
    }

    if (this.sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      DEBUG_BUILD && logger.log('[Tracing] Discarding transaction because its trace was not chosen to be sampled.');

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

    const metadata = this.metadata;

    const transaction: TransactionEvent = {
      contexts: {
        ...this._contexts,
        // We don't want to override trace context
        trace: spanToTraceContext(this),
      },
      spans: finishedSpans,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.endTimestamp,
      transaction: this.name,
      type: 'transaction',
      sdkProcessingMetadata: {
        ...metadata,
        dynamicSamplingContext: this.getDynamicSamplingContext(),
      },
      ...(metadata.source && {
        transaction_info: {
          source: metadata.source,
        },
      }),
    };

    const hasMeasurements = Object.keys(this._measurements).length > 0;

    if (hasMeasurements) {
      DEBUG_BUILD &&
        logger.log(
          '[Measurements] Adding measurements to transaction',
          JSON.stringify(this._measurements, undefined, 2),
        );
      transaction.measurements = this._measurements;
    }

    DEBUG_BUILD && logger.log(`[Tracing] Finishing ${this.op} transaction: ${this.name}.`);

    return transaction;
  }
}
