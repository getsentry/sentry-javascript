import type { Scope } from '@sentry/core';
import {
  addTracingExtensions,
  BaseClient,
  createCheckInEnvelope,
  getDynamicSamplingContextFromClient,
  SDK_VERSION,
} from '@sentry/core';
import type {
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
import { logger, uuid4 } from '@sentry/utils';

import { eventFromMessage, eventFromUnknownInput } from './eventbuilder';
import type { EdgeTransportOptions } from './transport';

export type EdgeClientOptions = ClientOptions<EdgeTransportOptions>;

/**
 * The Sentry Edge SDK Client.
 */
export class EdgeClient extends BaseClient<EdgeClientOptions> {
  /**
   * Creates a new Edge SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: EdgeClientOptions) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.nextjs',
      packages: [
        {
          name: 'npm:@sentry/nextjs',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    // The Edge client always supports tracing
    addTracingExtensions();

    super(options);
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    return Promise.resolve(eventFromUnknownInput(this._options.stackParser, exception, hint));
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
   * Create a cron monitor check in and send it to Sentry.
   *
   * @param checkIn An object that describes a check in.
   * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
   * to create a monitor automatically when sending a check in.
   */
  public captureCheckIn(checkIn: CheckIn, monitorConfig?: MonitorConfig, scope?: Scope): string {
    const id = checkIn.status !== 'in_progress' && checkIn.checkInId ? checkIn.checkInId : uuid4();

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
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, hint: EventHint, scope?: Scope): PromiseLike<Event | null> {
    event.platform = event.platform || 'edge';
    event.contexts = {
      ...event.contexts,
      runtime: event.contexts?.runtime || {
        name: 'edge',
      },
    };
    event.server_name = event.server_name || process.env.SENTRY_NAME;
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
      return [span?.transaction?.getDynamicSamplingContext(), span?.getTraceContext()];
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
