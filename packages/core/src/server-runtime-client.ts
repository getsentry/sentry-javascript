import type {
  BaseTransportOptions,
  CheckIn,
  ClientOptions,
  DynamicSamplingContext,
  Event,
  EventHint,
  MonitorConfig,
  ParameterizedString,
  SerializedCheckIn,
  SeverityLevel,
  TraceContext,
} from './types-hoist';

import { BaseClient } from './baseclient';
import { createCheckInEnvelope } from './checkin';
import { getIsolationScope, getTraceContextFromScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import type { Scope } from './scope';
import { SessionFlusher } from './sessionflusher';
import {
  getDynamicSamplingContextFromScope,
  getDynamicSamplingContextFromSpan,
  registerSpanErrorInstrumentation,
} from './tracing';
import { eventFromMessage, eventFromUnknownInput } from './utils-hoist/eventbuilder';
import { logger } from './utils-hoist/logger';
import { uuid4 } from './utils-hoist/misc';
import { resolvedSyncPromise } from './utils-hoist/syncpromise';
import { _getSpanForScope } from './utils/spanOnScope';
import { spanToTraceContext } from './utils/spanUtils';

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
  // eslint-disable-next-line deprecation/deprecation
  protected _sessionFlusher: SessionFlusher | undefined;

  /**
   * Creates a new Edge SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: O) {
    // Server clients always support tracing
    registerSpanErrorInstrumentation();

    super(options);
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    return resolvedSyncPromise(eventFromUnknownInput(this, this._options.stackParser, exception, hint));
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public captureException(exception: any, hint?: EventHint, scope?: Scope): string {
    // Check if `_sessionFlusher` exists because it is initialized (defined) only when the `autoSessionTracking` is enabled.
    // The expectation is that session aggregates are only sent when `autoSessionTracking` is enabled.
    // TODO(v9): Our goal in the future is to not have the `autoSessionTracking` option and instead rely on integrations doing the creation and sending of sessions. We will not have a central kill-switch for sessions.
    // TODO(v9): This should move into the httpIntegration.
    if (this._options.autoSessionTracking && this._sessionFlusher) {
      // eslint-disable-next-line deprecation/deprecation
      const requestSession = getIsolationScope().getRequestSession();

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
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string {
    // Check if `_sessionFlusher` exists because it is initialized only when the `autoSessionTracking` is enabled.
    // The expectation is that session aggregates are only sent when `autoSessionTracking` is enabled.
    // TODO(v9): Our goal in the future is to not have the `autoSessionTracking` option and instead rely on integrations doing the creation and sending of sessions. We will not have a central kill-switch for sessions.
    // TODO(v9): This should move into the httpIntegration.
    if (this._options.autoSessionTracking && this._sessionFlusher) {
      const eventType = event.type || 'exception';
      const isException =
        eventType === 'exception' && event.exception && event.exception.values && event.exception.values.length > 0;

      // If the event is of type Exception, then a request session should be captured
      if (isException) {
        // eslint-disable-next-line deprecation/deprecation
        const requestSession = getIsolationScope().getRequestSession();

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

  /**
   * Initializes an instance of SessionFlusher on the client which will aggregate and periodically flush session data.
   *
   * NOTICE: This method will implicitly create an interval that is periodically called.
   * To clean up this resources, call `.close()` when you no longer intend to use the client.
   * Not doing so will result in a memory leak.
   */
  public initSessionFlusher(): void {
    const { release, environment } = this._options;
    if (!release) {
      DEBUG_BUILD && logger.warn('Cannot initialize an instance of SessionFlusher if no release is provided!');
    } else {
      // eslint-disable-next-line deprecation/deprecation
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
    const id = 'checkInId' in checkIn && checkIn.checkInId ? checkIn.checkInId : uuid4();
    if (!this._isEnabled()) {
      DEBUG_BUILD && logger.warn('SDK not enabled, will not capture checkin.');
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

    DEBUG_BUILD && logger.info('Sending checkin:', checkIn.monitorSlug, checkIn.status);

    // sendEnvelope should not throw
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.sendEnvelope(envelope);

    return id;
  }

  /**
   * Method responsible for capturing/ending a request session by calling `incrementSessionStatusCount` to increment
   * appropriate session aggregates bucket
   *
   * @deprecated This method should not be used or extended. It's functionality will move into the `httpIntegration` and not be part of any public API.
   */
  protected _captureRequestSession(): void {
    if (!this._sessionFlusher) {
      DEBUG_BUILD && logger.warn('Discarded request mode session because autoSessionTracking option was disabled');
    } else {
      this._sessionFlusher.incrementSessionStatusCount();
    }
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(
    event: Event,
    hint: EventHint,
    scope?: Scope,
    isolationScope?: Scope,
  ): PromiseLike<Event | null> {
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

    return super._prepareEvent(event, hint, scope, isolationScope);
  }

  /** Extract trace information from scope */
  protected _getTraceInfoFromScope(
    scope: Scope | undefined,
  ): [dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined, traceContext: TraceContext | undefined] {
    if (!scope) {
      return [undefined, undefined];
    }

    const span = _getSpanForScope(scope);

    const traceContext = span ? spanToTraceContext(span) : getTraceContextFromScope(scope);
    const dynamicSamplingContext = span
      ? getDynamicSamplingContextFromSpan(span)
      : getDynamicSamplingContextFromScope(this, scope);
    return [dynamicSamplingContext, traceContext];
  }
}
