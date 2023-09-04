import type {
  BaseTransportOptions,
  CheckIn,
  ClientOptions,
  DynamicSamplingContext,
  Event,
  EventHint,
  MonitorConfig,
  SerializedCheckIn,
  Severity,
  SeverityLevel,
  TraceContext,
} from '@sentry/types';
import { eventFromMessage, eventFromUnknownInput, logger, uuid4 } from '@sentry/utils';

import { BaseClient } from './baseclient';
import { createCheckInEnvelope } from './checkin';
import { getCurrentHub } from './hub';
import type { Scope } from './scope';
import { SessionFlusher } from './sessionflusher';
import { addTracingExtensions, getDynamicSamplingContextFromClient } from './tracing';

export interface ServerRuntimeClientOptions extends ClientOptions<BaseTransportOptions> {
  platform?: string;
  runtime?: { name: string; version?: string };
  serverName?: string;
}

/**
 * The Sentry Server Runtime Client SDK.
 */
export class ServerRuntimeClient<
  O extends ClientOptions & ServerRuntimeClientOptions = ServerRuntimeClientOptions,
> extends BaseClient<O> {
  protected _sessionFlusher: SessionFlusher | undefined;

  /**
   * Creates a new Edge SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: O) {
    // Server clients always support tracing
    addTracingExtensions();

    super(options);
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    return Promise.resolve(eventFromUnknownInput(getCurrentHub, this._options.stackParser, exception, hint));
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level: Severity | SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    return Promise.resolve(
      eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace),
    );
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public captureException(exception: any, hint?: EventHint, scope?: Scope): string | undefined {
    // Check if the flag `autoSessionTracking` is enabled, and if `_sessionFlusher` exists because it is initialised only
    // when the `requestHandler` middleware is used, and hence the expectation is to have SessionAggregates payload
    // sent to the Server only when the `requestHandler` middleware is used
    if (this._options.autoSessionTracking && this._sessionFlusher && scope) {
      const requestSession = scope.getRequestSession();

      // Necessary checks to ensure this is code block is executed only within a request
      // Should override the status only if `requestSession.status` is `Ok`, which is its initial stage
      if (requestSession && requestSession.status === 'ok') {
        requestSession.status = 'errored';
      }
    }

    return super.captureException(exception, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string | undefined {
    // Check if the flag `autoSessionTracking` is enabled, and if `_sessionFlusher` exists because it is initialised only
    // when the `requestHandler` middleware is used, and hence the expectation is to have SessionAggregates payload
    // sent to the Server only when the `requestHandler` middleware is used
    if (this._options.autoSessionTracking && this._sessionFlusher && scope) {
      const eventType = event.type || 'exception';
      const isException =
        eventType === 'exception' && event.exception && event.exception.values && event.exception.values.length > 0;

      // If the event is of type Exception, then a request session should be captured
      if (isException) {
        const requestSession = scope.getRequestSession();

        // Ensure that this is happening within the bounds of a request, and make sure not to override
        // Session Status if Errored / Crashed
        if (requestSession && requestSession.status === 'ok') {
          requestSession.status = 'errored';
        }
      }
    }

    return super.captureEvent(event, hint, scope);
  }

  /**
   *
   * @inheritdoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    if (this._sessionFlusher) {
      this._sessionFlusher.close();
    }
    return super.close(timeout);
  }

  /** Method that initialises an instance of SessionFlusher on Client */
  public initSessionFlusher(): void {
    const { release, environment } = this._options;
    if (!release) {
      __DEBUG_BUILD__ && logger.warn('Cannot initialise an instance of SessionFlusher if no release is provided!');
    } else {
      this._sessionFlusher = new SessionFlusher(this, {
        release,
        environment,
      });
    }
  }

  /**
   * Create a cron monitor check in and send it to Sentry.
   *
   * @param checkIn An object that describes a check in.
   * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
   * to create a monitor automatically when sending a check in.
   */
  public captureCheckIn(checkIn: CheckIn, monitorConfig?: MonitorConfig, scope?: Scope): string {
    const id = checkIn.status !== 'in_progress' && checkIn.checkInId ? checkIn.checkInId : uuid4();
    if (!this._isEnabled()) {
      __DEBUG_BUILD__ && logger.warn('SDK not enabled, will not capture checkin.');
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

    if (checkIn.status !== 'in_progress') {
      serializedCheckIn.duration = checkIn.duration;
    }

    if (monitorConfig) {
      serializedCheckIn.monitor_config = {
        schedule: monitorConfig.schedule,
        checkin_margin: monitorConfig.checkinMargin,
        max_runtime: monitorConfig.maxRuntime,
        timezone: monitorConfig.timezone,
      };
    }

    const [dynamicSamplingContext, traceContext] = this._getTraceInfoFromScope(scope);
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

    __DEBUG_BUILD__ && logger.info('Sending checkin:', checkIn.monitorSlug, checkIn.status);
    void this._sendEnvelope(envelope);
    return id;
  }

  /**
   * Method responsible for capturing/ending a request session by calling `incrementSessionStatusCount` to increment
   * appropriate session aggregates bucket
   */
  protected _captureRequestSession(): void {
    if (!this._sessionFlusher) {
      __DEBUG_BUILD__ && logger.warn('Discarded request mode session because autoSessionTracking option was disabled');
    } else {
      this._sessionFlusher.incrementSessionStatusCount();
    }
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, hint: EventHint, scope?: Scope): PromiseLike<Event | null> {
    if (this._options.platform) {
      event.platform = event.platform || this._options.platform;
    }

    if (this._options.runtime) {
      event.contexts = {
        ...event.contexts,
        runtime: (event.contexts || {}).runtime || this._options.runtime,
      };
    }

    if (this._options.serverName) {
      event.server_name = event.server_name || this._options.serverName;
    }

    return super._prepareEvent(event, hint, scope);
  }

  /** Extract trace information from scope */
  private _getTraceInfoFromScope(
    scope: Scope | undefined,
  ): [dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined, traceContext: TraceContext | undefined] {
    if (!scope) {
      return [undefined, undefined];
    }

    const span = scope.getSpan();
    if (span) {
      const samplingContext = span.transaction ? span.transaction.getDynamicSamplingContext() : undefined;
      return [samplingContext, span.getTraceContext()];
    }

    const { traceId, spanId, parentSpanId, dsc } = scope.getPropagationContext();
    const traceContext: TraceContext = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
    };
    if (dsc) {
      return [dsc, traceContext];
    }

    return [getDynamicSamplingContextFromClient(traceId, this, scope), traceContext];
  }
}
