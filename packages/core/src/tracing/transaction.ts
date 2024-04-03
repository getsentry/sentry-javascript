import type {
  Contexts,
  Hub,
  MeasurementUnit,
  Measurements,
  SpanJSON,
  SpanTimeInput,
  Transaction as TransactionInterface,
  TransactionArguments,
  TransactionEvent,
  TransactionSource,
} from '@sentry/types';
import { dropUndefinedKeys, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { getCurrentHub } from '../hub';
import { getMetricSummaryJsonForSpan } from '../metrics/metric-summary';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '../semanticAttributes';
import { getSpanDescendants, spanTimeInputToSeconds, spanToJSON, spanToTraceContext } from '../utils/spanUtils';
import { getDynamicSamplingContextFromSpan } from './dynamicSamplingContext';
import { SentrySpan } from './sentrySpan';
import { getCapturedScopesOnSpan } from './utils';

/** JSDoc */
export class Transaction extends SentrySpan implements TransactionInterface {
  /**
   * The reference to the current hub.
   */
  public _hub: Hub;

  protected _name: string;

  private _measurements: Measurements;

  private _contexts: Contexts;

  private _trimEnd?: boolean | undefined;

  /**
   * This constructor should never be called manually.
   * @internal
   * @hideconstructor
   * @hidden
   *
   * @deprecated Transactions will be removed in v8. Use spans instead.
   */
  public constructor(transactionContext: TransactionArguments, hub?: Hub) {
    super(transactionContext);
    this._measurements = {};
    this._contexts = {};

    // eslint-disable-next-line deprecation/deprecation
    this._hub = hub || getCurrentHub();

    this._name = transactionContext.name || '';

    this._trimEnd = transactionContext.trimEnd;

    this._attributes = {
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
      ...this._attributes,
    };
  }

  /** @inheritdoc */
  public updateName(name: string): this {
    this._name = name;
    this.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');
    return this;
  }

  /**
   * @inheritDoc
   *
   * @deprecated Use top-level `setMeasurement()` instead.
   */
  public setMeasurement(name: string, value: number, unit: MeasurementUnit = ''): void {
    this._measurements[name] = { value, unit };
  }

  /**
   * @inheritDoc
   */
  public end(endTimestamp?: SpanTimeInput): string | undefined {
    const timestampInS = spanTimeInputToSeconds(endTimestamp);
    const transaction = this._finishTransaction(timestampInS);
    if (!transaction) {
      return undefined;
    }
    // eslint-disable-next-line deprecation/deprecation
    return this._hub.captureEvent(transaction);
  }

  /**
   * @inheritDoc
   */
  public toContext(): TransactionArguments {
    // eslint-disable-next-line deprecation/deprecation
    const spanContext = super.toContext();

    return dropUndefinedKeys({
      ...spanContext,
      name: this._name,
      trimEnd: this._trimEnd,
    });
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
    if (this._endTime !== undefined) {
      return undefined;
    }

    if (!this._name) {
      DEBUG_BUILD && logger.warn('Transaction has no name, falling back to `<unlabeled transaction>`.');
      this._name = '<unlabeled transaction>';
    }

    // just sets the end timestamp
    super.end(endTimestamp);

    // eslint-disable-next-line deprecation/deprecation
    const client = this._hub.getClient();

    if (this._sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      DEBUG_BUILD && logger.log('[Tracing] Discarding transaction because its trace was not chosen to be sampled.');

      if (client) {
        client.recordDroppedEvent('sample_rate', 'transaction');
      }

      return undefined;
    }

    // The transaction span itself should be filtered out
    const finishedSpans = getSpanDescendants(this).filter(span => span !== this);

    if (this._trimEnd && finishedSpans.length > 0) {
      const endTimes = finishedSpans.map(span => spanToJSON(span).timestamp).filter(Boolean) as number[];
      this._endTime = endTimes.reduce((prev, current) => {
        return prev > current ? prev : current;
      });
    }

    // We want to filter out any incomplete SpanJSON objects
    function isFullFinishedSpan(input: Partial<SpanJSON>): input is SpanJSON {
      return !!input.start_timestamp && !!input.timestamp && !!input.span_id && !!input.trace_id;
    }

    const spans = finishedSpans.map(span => spanToJSON(span)).filter(isFullFinishedSpan);

    const { scope: capturedSpanScope, isolationScope: capturedSpanIsolationScope } = getCapturedScopesOnSpan(this);

    const source = this._attributes['sentry.source'] as TransactionSource | undefined;

    const transaction: TransactionEvent = {
      contexts: {
        ...this._contexts,
        // We don't want to override trace context
        trace: spanToTraceContext(this),
      },
      spans,
      start_timestamp: this._startTime,
      timestamp: this._endTime,
      transaction: this._name,
      type: 'transaction',
      sdkProcessingMetadata: {
        capturedSpanScope,
        capturedSpanIsolationScope,
        ...dropUndefinedKeys({
          dynamicSamplingContext: getDynamicSamplingContextFromSpan(this),
        }),
      },
      _metrics_summary: getMetricSummaryJsonForSpan(this),
      ...(source && {
        transaction_info: {
          source,
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

    return transaction;
  }
}
