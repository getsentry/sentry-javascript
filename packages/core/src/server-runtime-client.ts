import { SERVER_ADDRESS } from '@sentry/conventions/attributes';
import { createCheckInEnvelope } from './checkin';
import { _makeDoNotSendEventError, Client, isExceptionEvent } from './client';
import { getIsolationScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import {
  spanStreamingIntegration,
  INTEGRATION_NAME as SPAN_STREAMING_INTEGRATION_NAME,
} from './integrations/spanStreaming';
import type { Scope } from './scope';
import { DEFAULT_TRANSPORT_BUFFER_SIZE } from './transports/base';
import { addUserAgentToTransportHeaders } from './transports/userAgent';
import type { CheckIn, MonitorConfig, SerializedCheckIn } from './types/checkin';
import type { Event, EventHint } from './types/event';
import type { ClientOptions } from './types/options';
import type { ParameterizedString } from './types/parameterize';
import type { SeverityLevel } from './types/severity';
import type { BaseTransportOptions, Transport } from './types/transport';
import { debug } from './utils/debug-logger';
import { eventFromMessage, eventFromUnknownInput } from './utils/eventbuilder';
import { isMarkedDuplicate, setDedupeContext } from './utils/dedupeContext';
import { hasUnhandledException, isAlreadyCaptured, uuid4 } from './utils/misc';
import {
  addPendingRequestSessionError,
  crashRequestSessionIfErrored,
  getRequestSession,
  setRequestSessionErroredOrCrashed,
} from './utils/requestSession';
import { makePromiseBuffer } from './utils/promisebuffer';
import { rejectedSyncPromise, resolvedSyncPromise } from './utils/syncpromise';
import { _getTraceInfoFromScope } from './utils/trace-info';
import { applyServerTunnelDefaults } from './utils/tunnelDefaults';

const DUPLICATE_EVENT_ERROR = 'Event is a duplicate of the previously captured event, will not send event.';

export interface ServerRuntimeClientOptions extends ClientOptions<BaseTransportOptions> {
  platform?: string;
  runtime?: { name: string; version?: string };
  serverName?: string;
}

declare const __SENTRY_TRACING__: boolean;

/**
 * The Sentry Server Runtime Client SDK.
 */
export class ServerRuntimeClient<
  O extends ClientOptions & ServerRuntimeClientOptions = ServerRuntimeClientOptions,
> extends Client<O> {
  private _disposeCallbacks: (() => void)[] = [];

  /** Number of errors that are never sent, but run through event processing to update sessions. */
  private _numCountingWithoutSlot = 0;

  /**
   * Creates a new Edge SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: O) {
    addUserAgentToTransportHeaders(options);

    // When span streaming is enabled (`traceLifecycle: 'stream'`), the `spanStreamingIntegration`
    // is required to flush spans. We add it here so the individual server SDKs don't have to.
    // A user-provided `spanStreamingIntegration` always takes precedence over the one we add.
    if (
      (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) &&
      options.traceLifecycle !== 'static' &&
      !options.integrations.some(i => i.name === SPAN_STREAMING_INTEGRATION_NAME)
    ) {
      options.integrations.push(spanStreamingIntegration());
    }

    super(options);

    applyServerTunnelDefaults(this);
    this._setUpMetricsProcessing();
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    const event = eventFromUnknownInput(this, this._options.stackParser, exception, hint);
    event.level = 'error';

    return resolvedSyncPromise(event);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(
    message: ParameterizedString,
    level: SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    return resolvedSyncPromise(
      eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace),
    );
  }

  /**
   * @inheritDoc
   */
  public captureException(exception: unknown, hint?: EventHint, scope?: Scope): string {
    if (isAlreadyCaptured(exception)) {
      onAlreadyCapturedError(hint);
    }
    return super.captureException(exception, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string {
    if (isExceptionEvent(event) && isAlreadyCaptured(hint?.originalException)) {
      onAlreadyCapturedError(hint);
    }
    return super.captureEvent(event, hint, scope);
  }

  /**
   * @inheritDoc
   */
  protected override _processEvent(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<Event> {
    if (!isExceptionEvent(event)) {
      return super._processEvent(event, hint, currentScope, isolationScope);
    }

    const canCountDuplicate =
      this._canCountWithoutSlot() && this._canErrorChangeSessions(event, hint, currentScope, isolationScope);
    setDedupeContext(
      hint,
      canCountDuplicate ? { mode: 'mark', isolationScope, isDuplicate: false } : { mode: 'drop', isolationScope },
    );
    const processedEvent = super._processEvent(event, hint, currentScope, isolationScope);
    addPendingRequestSessionError(isolationScope, processedEvent);
    return processedEvent;
  }

  /**
   * Hands a duplicate that Dedupe marked over to {@link ServerRuntimeClient._countWithoutSlot}.
   */
  protected override _applyFilters(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<Event> {
    const filtered = super._applyFilters(event, hint, currentScope, isolationScope);
    const countDuplicate = (processedEvent: Event): void => {
      this._updateSessions(processedEvent, currentScope, isolationScope);
      this.recordDroppedEvent('event_processor', 'error');
    };

    // The event processors before Dedupe are usually synchronous, so most duplicates are known here.
    if (isMarkedDuplicate(hint)) {
      this._countWithoutSlot(filtered.then(countDuplicate), isolationScope);
      return rejectedSyncPromise(_makeDoNotSendEventError(DUPLICATE_EVENT_ERROR));
    }

    return filtered.then(processedEvent => {
      // Dedupe ran after an asynchronous event processor.
      if (isMarkedDuplicate(hint)) {
        countDuplicate(processedEvent);
        throw _makeDoNotSendEventError(DUPLICATE_EVENT_ERROR);
      }
      return processedEvent;
    });
  }

  /**
   * @inheritDoc
   */
  protected override _countSampledOutError(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<void> {
    if (this._canCountWithoutSlot()) {
      this._countWithoutSlot(super._countSampledOutError(event, hint, currentScope, isolationScope), isolationScope);
    } else {
      this.recordDroppedEvent('sample_rate', 'error');
    }
    return resolvedSyncPromise();
  }

  /**
   * @inheritDoc
   */
  protected override _canErrorChangeSessions(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): boolean {
    if (super._canErrorChangeSessions(event, hint, currentScope, isolationScope)) {
      return true;
    }
    if (!isExceptionEvent(event)) {
      return false;
    }

    const requestSessionStatus = getRequestSession(isolationScope)?.status;
    return requestSessionStatus === 'ok' || (requestSessionStatus === 'errored' && hasUnhandledException(event, hint));
  }

  /**
   * @inheritDoc
   */
  protected override _updateSessions(event: Event, currentScope: Scope, isolationScope: Scope): void {
    super._updateSessions(event, currentScope, isolationScope);
    if (isExceptionEvent(event)) {
      setRequestSessionErroredOrCrashed(isolationScope, hasUnhandledException(event));
    }
  }

  /**
   * @inheritDoc
   */
  protected override _onQueueOverflow(hint: EventHint): void {
    // Without the event pipeline, filters cannot drop the error, so it counts.
    setRequestSessionErroredOrCrashed(getIsolationScope(), hint.mechanism?.handled === false);
  }

  /**
   * Create a cron monitor check in and send it to Sentry.
   *
   * @param checkIn An object that describes a check in.
   * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
   * to create a monitor automatically when sending a check in.
   */
  public captureCheckIn(checkIn: CheckIn, monitorConfig?: MonitorConfig, scope?: Scope): string {
    const id = 'checkInId' in checkIn && checkIn.checkInId ? checkIn.checkInId : uuid4();
    if (!this._isEnabled()) {
      DEBUG_BUILD && debug.warn('SDK not enabled, will not capture check-in.');
      return id;
    }

    const options = this.getOptions();
    const { release, environment, tunnel } = options;

    const serializedCheckIn: SerializedCheckIn = {
      check_in_id: id,
      monitor_slug: checkIn.monitorSlug,
      status: checkIn.status,
      release,
      environment,
    };

    if ('duration' in checkIn) {
      serializedCheckIn.duration = checkIn.duration;
    }

    if (monitorConfig) {
      serializedCheckIn.monitor_config = {
        schedule: monitorConfig.schedule,
        checkin_margin: monitorConfig.checkinMargin,
        max_runtime: monitorConfig.maxRuntime,
        timezone: monitorConfig.timezone,
        failure_issue_threshold: monitorConfig.failureIssueThreshold,
        recovery_threshold: monitorConfig.recoveryThreshold,
      };
    }

    const [dynamicSamplingContext, traceContext] = _getTraceInfoFromScope(this, scope);
    if (traceContext) {
      serializedCheckIn.contexts = {
        trace: traceContext,
      };
    }

    const envelope = createCheckInEnvelope(
      serializedCheckIn,
      dynamicSamplingContext,
      this.getSdkMetadata(),
      tunnel,
      this.getDsn(),
    );

    DEBUG_BUILD && debug.log('Sending checkin:', checkIn.monitorSlug, checkIn.status);

    // sendEnvelope should not throw
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.sendEnvelope(envelope);

    return id;
  }

  /**
   * @inheritDoc
   */
  public override registerCleanup(callback: () => void): void {
    this._disposeCallbacks.push(callback);
  }

  /**
   * Disposes of the client and releases all resources.
   *
   * This method clears all internal state to allow the client to be garbage collected.
   * It clears hooks, event processors, integrations, transport, and other internal references.
   *
   * Call this method after flushing to allow the client to be garbage collected.
   * After calling dispose(), the client should not be used anymore.
   *
   * Subclasses should override this method to clean up their own resources and call `super.dispose()`.
   */
  public override dispose(): void {
    DEBUG_BUILD && debug.log('Disposing client...');

    // Run all registered cleanup callbacks
    for (const callback of this._disposeCallbacks) {
      try {
        callback();
      } catch {
        // Ignore errors in cleanup callbacks
      }
    }
    this._disposeCallbacks.length = 0;

    for (const hookName of Object.keys(this._hooks)) {
      this._hooks[hookName]?.clear();
    }

    this._hooks = {};
    this._eventProcessors.length = 0;
    this._integrations = {};
    this._outcomes = {};
    (this as unknown as { _transport?: Transport })._transport = undefined;
    this._promiseBuffer = makePromiseBuffer(DEFAULT_TRANSPORT_BUFFER_SIZE);
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<Event | null> {
    if (this._options.platform) {
      event.platform = event.platform || this._options.platform;
    }

    if (this._options.runtime) {
      event.contexts = {
        ...event.contexts,
        runtime: event.contexts?.runtime || this._options.runtime,
      };
    }

    if (this._options.serverName) {
      event.server_name = event.server_name || this._options.serverName;
    }

    return super._prepareEvent(event, hint, currentScope, isolationScope);
  }

  /**
   * Whether an error that is never sent can still run event processing to update sessions. The limit keeps that
   * work bounded in an error storm.
   */
  private _canCountWithoutSlot(): boolean {
    return this._numCountingWithoutSlot < (this._options.transportOptions?.bufferSize ?? DEFAULT_TRANSPORT_BUFFER_SIZE);
  }

  /**
   * Tracks the session update of an error that is never sent. It runs outside of the promise buffer, so that it
   * never takes a slot from an error that is sent.
   */
  private _countWithoutSlot(counting: PromiseLike<void>, isolationScope: Scope): void {
    this._numProcessing++;
    this._numCountingWithoutSlot++;
    const settle = (): void => {
      this._numProcessing--;
      this._numCountingWithoutSlot--;
    };
    counting.then(settle, settle);
    addPendingRequestSessionError(isolationScope, counting);
  }

  /**
   * Process a server-side metric before it is captured.
   */
  private _setUpMetricsProcessing(): void {
    this.on('processMetric', metric => {
      if (this._options.serverName) {
        metric.attributes = {
          [SERVER_ADDRESS]: this._options.serverName,
          ...metric.attributes,
        };
      }
    });
  }
}

/**
 * An unhandled error that was captured before, e.g. captured as handled, then rethrown and captured again by a
 * framework error handler, crashes the request session if the first capture counted.
 */
function onAlreadyCapturedError(hint: EventHint | undefined): void {
  if (hint?.mechanism?.handled === false) {
    crashRequestSessionIfErrored(getIsolationScope());
  }
}
