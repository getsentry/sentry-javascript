import { createCheckInEnvelope } from './checkin';
import { Client } from './client';
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
import { uuid4 } from './utils/misc';
import { makePromiseBuffer } from './utils/promisebuffer';
import { resolvedSyncPromise } from './utils/syncpromise';
import { _getTraceInfoFromScope } from './utils/trace-info';

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
  protected override _processEvent(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<Event> {
    const processedEvent = super._processEvent(event, hint, currentScope, isolationScope);

    const requestSession = isolationScope.getScopeData().sdkProcessingMetadata.requestSession;
    if (requestSession && !event.type) {
      const pendingErrors = (requestSession.pendingErrors ||= new Set());
      const settle = (): void => {
        pendingErrors.delete(processedEvent);
      };
      pendingErrors.add(processedEvent);
      processedEvent.then(settle, settle);
    }

    return processedEvent;
  }

  /**
   * @inheritDoc
   */
  protected override _updateSessionsFromEvent(event: Event, currentScope: Scope, isolationScope: Scope): void {
    super._updateSessionsFromEvent(event, currentScope, isolationScope);
    setRequestSessionErroredOrCrashed(isolationScope, event);
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

function setRequestSessionErroredOrCrashed(isolationScope: Scope, event: Event): void {
  const requestSession = isolationScope.getScopeData().sdkProcessingMetadata.requestSession;
  const exceptions = event.exception?.values;
  if (requestSession && exceptions?.length) {
    // We mutate instead of doing `setSdkProcessingMetadata` because the http integration stores away a particular
    // isolationScope. If that isolation scope is forked, setting the processing metadata here will not mutate the
    // original isolation scope that the http integration stored away.
    const isHandledException = !exceptions.some(exception => exception.mechanism?.handled === false);
    // A request session can go from "errored" -> "crashed" but not "crashed" -> "errored".
    // Crashed (unhandled exception) is worse than errored (handled exception).
    if (isHandledException && requestSession.status !== 'crashed') {
      requestSession.status = 'errored';
    } else if (!isHandledException) {
      requestSession.status = 'crashed';
    }
  }
}
