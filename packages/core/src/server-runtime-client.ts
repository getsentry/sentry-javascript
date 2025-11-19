import { createCheckInEnvelope } from './checkin';
import { Client } from './client';
import { getIsolationScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import type { Scope } from './scope';
import { registerSpanErrorInstrumentation } from './tracing';
import { addUserAgentToTransportHeaders } from './transports/userAgent';
import type { CheckIn, MonitorConfig, SerializedCheckIn } from './types-hoist/checkin';
import type { Event, EventHint } from './types-hoist/event';
import type { ClientOptions } from './types-hoist/options';
import type { ParameterizedString } from './types-hoist/parameterize';
import type { SeverityLevel } from './types-hoist/severity';
import type { BaseTransportOptions } from './types-hoist/transport';
import { debug } from './utils/debug-logger';
import { eventFromMessage, eventFromUnknownInput } from './utils/eventbuilder';
import { uuid4 } from './utils/misc';
import { resolvedSyncPromise } from './utils/syncpromise';
import { _getTraceInfoFromScope } from './utils/trace-info';

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
> extends Client<O> {
  /**
   * Creates a new Edge SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: O) {
    // Server clients always support tracing
    registerSpanErrorInstrumentation();

    addUserAgentToTransportHeaders(options);

    super(options);

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
    setCurrentRequestSessionErroredOrCrashed(hint);
    return super.captureException(exception, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string {
    // If the event is of type Exception, then a request session should be captured
    const isException = !event.type && event.exception?.values && event.exception.values.length > 0;
    if (isException) {
      setCurrentRequestSessionErroredOrCrashed(hint);
    }

    return super.captureEvent(event, hint, scope);
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
   * Process a server-side metric before it is captured.
   */
  private _setUpMetricsProcessing(): void {
    this.on('processMetric', metric => {
      if (this._options.serverName) {
        metric.attributes = {
          'server.address': this._options.serverName,
          ...metric.attributes,
        };
      }
    });
  }
}

function setCurrentRequestSessionErroredOrCrashed(eventHint?: EventHint): void {
  const requestSession = getIsolationScope().getScopeData().sdkProcessingMetadata.requestSession;
  if (requestSession) {
    // We mutate instead of doing `setSdkProcessingMetadata` because the http integration stores away a particular
    // isolationScope. If that isolation scope is forked, setting the processing metadata here will not mutate the
    // original isolation scope that the http integration stored away.
    const isHandledException = eventHint?.mechanism?.handled ?? true;
    // A request session can go from "errored" -> "crashed" but not "crashed" -> "errored".
    // Crashed (unhandled exception) is worse than errored (handled exception).
    if (isHandledException && requestSession.status !== 'crashed') {
      requestSession.status = 'errored';
    } else if (!isHandledException) {
      requestSession.status = 'crashed';
    }
  }
}
