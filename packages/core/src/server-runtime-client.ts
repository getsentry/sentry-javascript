import { createCheckInEnvelope } from './checkin';
import { _getTraceInfoFromScope, Client } from './client';
import { getIsolationScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import { _INTERNAL_flushLogsBuffer } from './logs/exports';
import type { Scope } from './scope';
import { registerSpanErrorInstrumentation } from './tracing';
import type { CheckIn, MonitorConfig, SerializedCheckIn } from './types-hoist/checkin';
import type { Event, EventHint } from './types-hoist/event';
import type { Log } from './types-hoist/log';
import type { Primitive } from './types-hoist/misc';
import type { ClientOptions } from './types-hoist/options';
import type { ParameterizedString } from './types-hoist/parameterize';
import type { SeverityLevel } from './types-hoist/severity';
import type { BaseTransportOptions } from './types-hoist/transport';
import { debug } from './utils/debug-logger';
import { eventFromMessage, eventFromUnknownInput } from './utils/eventbuilder';
import { isPrimitive } from './utils/is';
import { uuid4 } from './utils/misc';
import { resolvedSyncPromise } from './utils/syncpromise';

// TODO: Make this configurable
const DEFAULT_LOG_FLUSH_INTERVAL = 5000;

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
  private _logFlushIdleTimeout: ReturnType<typeof setTimeout> | undefined;
  private _logWeight: number;

  /**
   * Creates a new Edge SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: O) {
    // Server clients always support tracing
    registerSpanErrorInstrumentation();

    super(options);

    this._logWeight = 0;

    if (this._options.enableLogs) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const client = this;

      client.on('flushLogs', () => {
        client._logWeight = 0;
        clearTimeout(client._logFlushIdleTimeout);
      });

      client.on('afterCaptureLog', log => {
        client._logWeight += estimateLogSizeInBytes(log);

        // We flush the logs buffer if it exceeds 0.8 MB
        // The log weight is a rough estimate, so we flush way before
        // the payload gets too big.
        if (client._logWeight >= 800_000) {
          _INTERNAL_flushLogsBuffer(client);
        } else {
          // start an idle timeout to flush the logs buffer if no logs are captured for a while
          client._logFlushIdleTimeout = setTimeout(() => {
            _INTERNAL_flushLogsBuffer(client);
          }, DEFAULT_LOG_FLUSH_INTERVAL);
        }
      });

      client.on('flush', () => {
        _INTERNAL_flushLogsBuffer(client);
      });
    }
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

/**
 * Estimate the size of a log in bytes.
 *
 * @param log - The log to estimate the size of.
 * @returns The estimated size of the log in bytes.
 */
function estimateLogSizeInBytes(log: Log): number {
  let weight = 0;

  // Estimate byte size of 2 bytes per character. This is a rough estimate JS strings are stored as UTF-16.
  if (log.message) {
    weight += log.message.length * 2;
  }

  if (log.attributes) {
    Object.values(log.attributes).forEach(value => {
      if (Array.isArray(value)) {
        weight += value.length * estimatePrimitiveSizeInBytes(value[0]);
      } else if (isPrimitive(value)) {
        weight += estimatePrimitiveSizeInBytes(value);
      } else {
        // For objects values, we estimate the size of the object as 100 bytes
        weight += 100;
      }
    });
  }

  return weight;
}

function estimatePrimitiveSizeInBytes(value: Primitive): number {
  if (typeof value === 'string') {
    return value.length * 2;
  } else if (typeof value === 'number') {
    return 8;
  } else if (typeof value === 'boolean') {
    return 4;
  }

  return 0;
}
