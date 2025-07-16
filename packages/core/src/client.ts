/* eslint-disable max-lines */
import { getEnvelopeEndpointWithUrlEncodedAuth } from './api';
import { DEFAULT_ENVIRONMENT } from './constants';
import { getCurrentScope, getIsolationScope, getTraceContextFromScope, withScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import { createEventEnvelope, createSessionEnvelope } from './envelope';
import type { IntegrationIndex } from './integration';
import { afterSetupIntegrations, setupIntegration, setupIntegrations } from './integration';
import type { Scope } from './scope';
import { updateSession } from './session';
import {
  getDynamicSamplingContextFromScope,
  getDynamicSamplingContextFromSpan,
} from './tracing/dynamicSamplingContext';
import type { Breadcrumb, BreadcrumbHint, FetchBreadcrumbHint, XhrBreadcrumbHint } from './types-hoist/breadcrumb';
import type { CheckIn, MonitorConfig } from './types-hoist/checkin';
import type { EventDropReason, Outcome } from './types-hoist/clientreport';
import type { TraceContext } from './types-hoist/context';
import type { DataCategory } from './types-hoist/datacategory';
import type { DsnComponents } from './types-hoist/dsn';
import type { DynamicSamplingContext, Envelope } from './types-hoist/envelope';
import type { ErrorEvent, Event, EventHint, TransactionEvent } from './types-hoist/event';
import type { EventProcessor } from './types-hoist/eventprocessor';
import type { FeedbackEvent } from './types-hoist/feedback';
import type { Integration } from './types-hoist/integration';
import type { Log } from './types-hoist/log';
import type { ClientOptions } from './types-hoist/options';
import type { ParameterizedString } from './types-hoist/parameterize';
import type { SdkMetadata } from './types-hoist/sdkmetadata';
import type { Session, SessionAggregates } from './types-hoist/session';
import type { SeverityLevel } from './types-hoist/severity';
import type { Span, SpanAttributes, SpanContextData, SpanJSON } from './types-hoist/span';
import type { StartSpanOptions } from './types-hoist/startSpanOptions';
import type { Transport, TransportMakeRequestResponse } from './types-hoist/transport';
import { createClientReportEnvelope } from './utils/clientreport';
import { debug } from './utils/debug-logger';
import { dsnToString, makeDsn } from './utils/dsn';
import { addItemToEnvelope, createAttachmentEnvelopeItem } from './utils/envelope';
import { getPossibleEventMessages } from './utils/eventUtils';
import { isParameterizedString, isPlainObject, isPrimitive, isThenable } from './utils/is';
import { merge } from './utils/merge';
import { checkOrSetAlreadyCaught, uuid4 } from './utils/misc';
import { parseSampleRate } from './utils/parseSampleRate';
import { prepareEvent } from './utils/prepareEvent';
import { getActiveSpan, showSpanDropWarning, spanToTraceContext } from './utils/spanUtils';
import { rejectedSyncPromise, resolvedSyncPromise, SyncPromise } from './utils/syncpromise';
import { convertSpanJsonToTransactionEvent, convertTransactionEventToSpanJson } from './utils/transactionEvent';

const ALREADY_SEEN_ERROR = "Not capturing exception because it's already been captured.";
const MISSING_RELEASE_FOR_SESSION_ERROR = 'Discarded session because of missing or non-string release';

const INTERNAL_ERROR_SYMBOL = Symbol.for('SentryInternalError');
const DO_NOT_SEND_EVENT_SYMBOL = Symbol.for('SentryDoNotSendEventError');

interface InternalError {
  message: string;
  [INTERNAL_ERROR_SYMBOL]: true;
}

interface DoNotSendEventError {
  message: string;
  [DO_NOT_SEND_EVENT_SYMBOL]: true;
}

function _makeInternalError(message: string): InternalError {
  return {
    message,
    [INTERNAL_ERROR_SYMBOL]: true,
  };
}

function _makeDoNotSendEventError(message: string): DoNotSendEventError {
  return {
    message,
    [DO_NOT_SEND_EVENT_SYMBOL]: true,
  };
}

function _isInternalError(error: unknown): error is InternalError {
  return !!error && typeof error === 'object' && INTERNAL_ERROR_SYMBOL in error;
}

function _isDoNotSendEventError(error: unknown): error is DoNotSendEventError {
  return !!error && typeof error === 'object' && DO_NOT_SEND_EVENT_SYMBOL in error;
}

/**
 * Base implementation for all JavaScript SDK clients.
 *
 * Call the constructor with the corresponding options
 * specific to the client subclass. To access these options later, use
 * {@link Client.getOptions}.
 *
 * If a Dsn is specified in the options, it will be parsed and stored. Use
 * {@link Client.getDsn} to retrieve the Dsn at any moment. In case the Dsn is
 * invalid, the constructor will throw a {@link SentryException}. Note that
 * without a valid Dsn, the SDK will not send any events to Sentry.
 *
 * Before sending an event, it is passed through
 * {@link Client._prepareEvent} to add SDK information and scope data
 * (breadcrumbs and context). To add more custom information, override this
 * method and extend the resulting prepared event.
 *
 * To issue automatically created events (e.g. via instrumentation), use
 * {@link Client.captureEvent}. It will prepare the event and pass it through
 * the callback lifecycle. To issue auto-breadcrumbs, use
 * {@link Client.addBreadcrumb}.
 *
 * @example
 * class NodeClient extends Client<NodeOptions> {
 *   public constructor(options: NodeOptions) {
 *     super(options);
 *   }
 *
 *   // ...
 * }
 */
export abstract class Client<O extends ClientOptions = ClientOptions> {
  /** Options passed to the SDK. */
  protected readonly _options: O;

  /** The client Dsn, if specified in options. Without this Dsn, the SDK will be disabled. */
  protected readonly _dsn?: DsnComponents;

  protected readonly _transport?: Transport;

  /** Array of set up integrations. */
  protected _integrations: IntegrationIndex;

  /** Number of calls being processed */
  protected _numProcessing: number;

  protected _eventProcessors: EventProcessor[];

  /** Holds flushable  */
  private _outcomes: { [key: string]: number };

  // eslint-disable-next-line @typescript-eslint/ban-types
  private _hooks: Record<string, Function[]>;

  /**
   * Initializes this client instance.
   *
   * @param options Options for the client.
   */
  protected constructor(options: O) {
    this._options = options;
    this._integrations = {};
    this._numProcessing = 0;
    this._outcomes = {};
    this._hooks = {};
    this._eventProcessors = [];

    if (options.dsn) {
      this._dsn = makeDsn(options.dsn);
    } else {
      DEBUG_BUILD && debug.warn('No DSN provided, client will not send events.');
    }

    if (this._dsn) {
      const url = getEnvelopeEndpointWithUrlEncodedAuth(
        this._dsn,
        options.tunnel,
        options._metadata ? options._metadata.sdk : undefined,
      );
      this._transport = options.transport({
        tunnel: this._options.tunnel,
        recordDroppedEvent: this.recordDroppedEvent.bind(this),
        ...options.transportOptions,
        url,
      });
    }
  }

  /**
   * Captures an exception event and sends it to Sentry.
   *
   * Unlike `captureException` exported from every SDK, this method requires that you pass it the current scope.
   */
  public captureException(exception: unknown, hint?: EventHint, scope?: Scope): string {
    const eventId = uuid4();

    // ensure we haven't captured this very object before
    if (checkOrSetAlreadyCaught(exception)) {
      DEBUG_BUILD && debug.log(ALREADY_SEEN_ERROR);
      return eventId;
    }

    const hintWithEventId = {
      event_id: eventId,
      ...hint,
    };

    this._process(
      this.eventFromException(exception, hintWithEventId).then(event =>
        this._captureEvent(event, hintWithEventId, scope),
      ),
    );

    return hintWithEventId.event_id;
  }

  /**
   * Captures a message event and sends it to Sentry.
   *
   * Unlike `captureMessage` exported from every SDK, this method requires that you pass it the current scope.
   */
  public captureMessage(
    message: ParameterizedString,
    level?: SeverityLevel,
    hint?: EventHint,
    currentScope?: Scope,
  ): string {
    const hintWithEventId = {
      event_id: uuid4(),
      ...hint,
    };

    const eventMessage = isParameterizedString(message) ? message : String(message);

    const promisedEvent = isPrimitive(message)
      ? this.eventFromMessage(eventMessage, level, hintWithEventId)
      : this.eventFromException(message, hintWithEventId);

    this._process(promisedEvent.then(event => this._captureEvent(event, hintWithEventId, currentScope)));

    return hintWithEventId.event_id;
  }

  /**
   * Captures a manually created event and sends it to Sentry.
   *
   * Unlike `captureEvent` exported from every SDK, this method requires that you pass it the current scope.
   */
  public captureEvent(event: Event, hint?: EventHint, currentScope?: Scope): string {
    const eventId = uuid4();

    // ensure we haven't captured this very object before
    if (hint?.originalException && checkOrSetAlreadyCaught(hint.originalException)) {
      DEBUG_BUILD && debug.log(ALREADY_SEEN_ERROR);
      return eventId;
    }

    const hintWithEventId = {
      event_id: eventId,
      ...hint,
    };

    const sdkProcessingMetadata = event.sdkProcessingMetadata || {};
    const capturedSpanScope: Scope | undefined = sdkProcessingMetadata.capturedSpanScope;
    const capturedSpanIsolationScope: Scope | undefined = sdkProcessingMetadata.capturedSpanIsolationScope;

    this._process(
      this._captureEvent(event, hintWithEventId, capturedSpanScope || currentScope, capturedSpanIsolationScope),
    );

    return hintWithEventId.event_id;
  }

  /**
   * Captures a session.
   */
  public captureSession(session: Session): void {
    this.sendSession(session);
    // After sending, we set init false to indicate it's not the first occurrence
    updateSession(session, { init: false });
  }

  /**
   * Create a cron monitor check in and send it to Sentry. This method is not available on all clients.
   *
   * @param checkIn An object that describes a check in.
   * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
   * to create a monitor automatically when sending a check in.
   * @param scope An optional scope containing event metadata.
   * @returns A string representing the id of the check in.
   */
  public captureCheckIn?(checkIn: CheckIn, monitorConfig?: MonitorConfig, scope?: Scope): string;

  /**
   * Get the current Dsn.
   */
  public getDsn(): DsnComponents | undefined {
    return this._dsn;
  }

  /**
   * Get the current options.
   */
  public getOptions(): O {
    return this._options;
  }

  /**
   * Get the SDK metadata.
   * @see SdkMetadata
   */
  public getSdkMetadata(): SdkMetadata | undefined {
    return this._options._metadata;
  }

  /**
   * Returns the transport that is used by the client.
   * Please note that the transport gets lazy initialized so it will only be there once the first event has been sent.
   */
  public getTransport(): Transport | undefined {
    return this._transport;
  }

  /**
   * Wait for all events to be sent or the timeout to expire, whichever comes first.
   *
   * @param timeout Maximum time in ms the client should wait for events to be flushed. Omitting this parameter will
   *   cause the client to wait until all events are sent before resolving the promise.
   * @returns A promise that will resolve with `true` if all events are sent before the timeout, or `false` if there are
   * still events in the queue when the timeout is reached.
   */
  public flush(timeout?: number): PromiseLike<boolean> {
    const transport = this._transport;
    if (transport) {
      this.emit('flush');
      return this._isClientDoneProcessing(timeout).then(clientFinished => {
        return transport.flush(timeout).then(transportFlushed => clientFinished && transportFlushed);
      });
    } else {
      return resolvedSyncPromise(true);
    }
  }

  /**
   * Flush the event queue and set the client to `enabled = false`. See {@link Client.flush}.
   *
   * @param {number} timeout Maximum time in ms the client should wait before shutting down. Omitting this parameter will cause
   *   the client to wait until all events are sent before disabling itself.
   * @returns {Promise<boolean>} A promise which resolves to `true` if the flush completes successfully before the timeout, or `false` if
   * it doesn't.
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this.flush(timeout).then(result => {
      this.getOptions().enabled = false;
      this.emit('close');
      return result;
    });
  }

  /**
   * Get all installed event processors.
   */
  public getEventProcessors(): EventProcessor[] {
    return this._eventProcessors;
  }

  /**
   * Adds an event processor that applies to any event processed by this client.
   */
  public addEventProcessor(eventProcessor: EventProcessor): void {
    this._eventProcessors.push(eventProcessor);
  }

  /**
   * Initialize this client.
   * Call this after the client was set on a scope.
   */
  public init(): void {
    if (
      this._isEnabled() ||
      // Force integrations to be setup even if no DSN was set when we have
      // Spotlight enabled. This is particularly important for browser as we
      // don't support the `spotlight` option there and rely on the users
      // adding the `spotlightBrowserIntegration()` to their integrations which
      // wouldn't get initialized with the check below when there's no DSN set.
      this._options.integrations.some(({ name }) => name.startsWith('Spotlight'))
    ) {
      this._setupIntegrations();
    }
  }

  /**
   * Gets an installed integration by its name.
   *
   * @returns {Integration|undefined} The installed integration or `undefined` if no integration with that `name` was installed.
   */
  public getIntegrationByName<T extends Integration = Integration>(integrationName: string): T | undefined {
    return this._integrations[integrationName] as T | undefined;
  }

  /**
   * Add an integration to the client.
   * This can be used to e.g. lazy load integrations.
   * In most cases, this should not be necessary,
   * and you're better off just passing the integrations via `integrations: []` at initialization time.
   * However, if you find the need to conditionally load & add an integration, you can use `addIntegration` to do so.
   */
  public addIntegration(integration: Integration): void {
    const isAlreadyInstalled = this._integrations[integration.name];

    // This hook takes care of only installing if not already installed
    setupIntegration(this, integration, this._integrations);
    // Here we need to check manually to make sure to not run this multiple times
    if (!isAlreadyInstalled) {
      afterSetupIntegrations(this, [integration]);
    }
  }

  /**
   * Send a fully prepared event to Sentry.
   */
  public sendEvent(event: Event, hint: EventHint = {}): void {
    this.emit('beforeSendEvent', event, hint);

    let env = createEventEnvelope(event, this._dsn, this._options._metadata, this._options.tunnel);

    for (const attachment of hint.attachments || []) {
      env = addItemToEnvelope(env, createAttachmentEnvelopeItem(attachment));
    }

    const promise = this.sendEnvelope(env);
    if (promise) {
      promise.then(sendResponse => this.emit('afterSendEvent', event, sendResponse), null);
    }
  }

  /**
   * Send a session or session aggregrates to Sentry.
   */
  public sendSession(session: Session | SessionAggregates): void {
    // Backfill release and environment on session
    const { release: clientReleaseOption, environment: clientEnvironmentOption = DEFAULT_ENVIRONMENT } = this._options;
    if ('aggregates' in session) {
      const sessionAttrs = session.attrs || {};
      if (!sessionAttrs.release && !clientReleaseOption) {
        DEBUG_BUILD && debug.warn(MISSING_RELEASE_FOR_SESSION_ERROR);
        return;
      }
      sessionAttrs.release = sessionAttrs.release || clientReleaseOption;
      sessionAttrs.environment = sessionAttrs.environment || clientEnvironmentOption;
      session.attrs = sessionAttrs;
    } else {
      if (!session.release && !clientReleaseOption) {
        DEBUG_BUILD && debug.warn(MISSING_RELEASE_FOR_SESSION_ERROR);
        return;
      }
      session.release = session.release || clientReleaseOption;
      session.environment = session.environment || clientEnvironmentOption;
    }

    this.emit('beforeSendSession', session);

    const env = createSessionEnvelope(session, this._dsn, this._options._metadata, this._options.tunnel);

    // sendEnvelope should not throw
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.sendEnvelope(env);
  }

  /**
   * Record on the client that an event got dropped (ie, an event that will not be sent to Sentry).
   */
  public recordDroppedEvent(reason: EventDropReason, category: DataCategory, count: number = 1): void {
    if (this._options.sendClientReports) {
      // We want to track each category (error, transaction, session, replay_event) separately
      // but still keep the distinction between different type of outcomes.
      // We could use nested maps, but it's much easier to read and type this way.
      // A correct type for map-based implementation if we want to go that route
      // would be `Partial<Record<SentryRequestType, Partial<Record<Outcome, number>>>>`
      // With typescript 4.1 we could even use template literal types
      const key = `${reason}:${category}`;
      DEBUG_BUILD && debug.log(`Recording outcome: "${key}"${count > 1 ? ` (${count} times)` : ''}`);
      this._outcomes[key] = (this._outcomes[key] || 0) + count;
    }
  }

  /* eslint-disable @typescript-eslint/unified-signatures */
  /**
   * Register a callback for whenever a span is started.
   * Receives the span as argument.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'spanStart', callback: (span: Span) => void): () => void;

  /**
   * Register a callback before span sampling runs. Receives a `samplingDecision` object argument with a `decision`
   * property that can be used to make a sampling decision that will be enforced, before any span sampling runs.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(
    hook: 'beforeSampling',
    callback: (
      samplingData: {
        spanAttributes: SpanAttributes;
        spanName: string;
        parentSampled?: boolean;
        parentSampleRate?: number;
        parentContext?: SpanContextData;
      },
      samplingDecision: { decision: boolean },
    ) => void,
  ): void;

  /**
   * Register a callback for after a span is ended.
   * NOTE: The span cannot be mutated anymore in this callback.
   * Receives the span as argument.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'spanEnd', callback: (span: Span) => void): () => void;

  /**
   * Register a callback for when an idle span is allowed to auto-finish.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'idleSpanEnableAutoFinish', callback: (span: Span) => void): () => void;

  /**
   * Register a callback for transaction start and finish.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'beforeEnvelope', callback: (envelope: Envelope) => void): () => void;

  /**
   * Register a callback that runs when stack frame metadata should be applied to an event.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'applyFrameMetadata', callback: (event: Event) => void): () => void;

  /**
   * Register a callback for before sending an event.
   * This is called right before an event is sent and should not be used to mutate the event.
   * Receives an Event & EventHint as arguments.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'beforeSendEvent', callback: (event: Event, hint?: EventHint | undefined) => void): () => void;

  /**
   * Register a callback for before sending a session or session aggregrates..
   * Receives the session/aggregate as second argument.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'beforeSendSession', callback: (session: Session | SessionAggregates) => void): () => void;

  /**
   * Register a callback for preprocessing an event,
   * before it is passed to (global) event processors.
   * Receives an Event & EventHint as arguments.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'preprocessEvent', callback: (event: Event, hint?: EventHint | undefined) => void): () => void;

  /**
   * Register a callback for postprocessing an event,
   * after it was passed to (global) event processors, before it is being sent.
   * Receives an Event & EventHint as arguments.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'postprocessEvent', callback: (event: Event, hint?: EventHint | undefined) => void): () => void;

  /**
   * Register a callback for when an event has been sent.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(
    hook: 'afterSendEvent',
    callback: (event: Event, sendResponse: TransportMakeRequestResponse) => void,
  ): () => void;

  /**
   * Register a callback before a breadcrumb is added.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'beforeAddBreadcrumb', callback: (breadcrumb: Breadcrumb, hint?: BreadcrumbHint) => void): () => void;

  /**
   * Register a callback when a DSC (Dynamic Sampling Context) is created.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'createDsc', callback: (dsc: DynamicSamplingContext, rootSpan?: Span) => void): () => void;

  /**
   * Register a callback when a Feedback event has been prepared.
   * This should be used to mutate the event. The options argument can hint
   * about what kind of mutation it expects.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(
    hook: 'beforeSendFeedback',
    callback: (feedback: FeedbackEvent, options?: { includeReplay?: boolean }) => void,
  ): () => void;

  /**
   * Register a callback when the feedback widget is opened in a user's browser
   */
  public on(hook: 'openFeedbackWidget', callback: () => void): () => void;

  /**
   * A hook for the browser tracing integrations to trigger a span start for a page load.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(
    hook: 'startPageLoadSpan',
    callback: (
      options: StartSpanOptions,
      traceOptions?: { sentryTrace?: string | undefined; baggage?: string | undefined },
    ) => void,
  ): () => void;

  /**
   * A hook for the browser tracing integrations to trigger after the pageload span was started.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'afterStartPageLoadSpan', callback: (span: Span) => void): () => void;

  /**
   * A hook for triggering right before a navigation span is started.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(
    hook: 'beforeStartNavigationSpan',
    callback: (options: StartSpanOptions, navigationOptions?: { isRedirect?: boolean }) => void,
  ): () => void;

  /**
   * A hook for browser tracing integrations to trigger a span for a navigation.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(
    hook: 'startNavigationSpan',
    callback: (options: StartSpanOptions, navigationOptions?: { isRedirect?: boolean }) => void,
  ): () => void;

  /**
   * A hook for GraphQL client integration to enhance a span with request data.
   * @returns A function that, when executed, removes the registered callback.
   */
  public on(
    hook: 'beforeOutgoingRequestSpan',
    callback: (span: Span, hint: XhrBreadcrumbHint | FetchBreadcrumbHint) => void,
  ): () => void;

  /**
   * A hook for GraphQL client integration to enhance a breadcrumb with request data.
   * @returns A function that, when executed, removes the registered callback.
   */
  public on(
    hook: 'beforeOutgoingRequestBreadcrumb',
    callback: (breadcrumb: Breadcrumb, hint: XhrBreadcrumbHint | FetchBreadcrumbHint) => void,
  ): () => void;

  /**
   * A hook that is called when the client is flushing
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'flush', callback: () => void): () => void;

  /**
   * A hook that is called when the client is closing
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'close', callback: () => void): () => void;

  /**
   * A hook that is called before a log is captured. This hooks runs before `beforeSendLog` is fired.
   *
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'beforeCaptureLog', callback: (log: Log) => void): () => void;

  /**
   * A hook that is called after a log is captured
   *
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'afterCaptureLog', callback: (log: Log) => void): () => void;

  /**
   * A hook that is called when the client is flushing logs
   *
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  public on(hook: 'flushLogs', callback: () => void): () => void;

  /**
   * Register a hook on this client.
   */
  public on(hook: string, callback: unknown): () => void {
    const hooks = (this._hooks[hook] = this._hooks[hook] || []);

    // @ts-expect-error We assume the types are correct
    hooks.push(callback);

    // This function returns a callback execution handler that, when invoked,
    // deregisters a callback. This is crucial for managing instances where callbacks
    // need to be unregistered to prevent self-referencing in callback closures,
    // ensuring proper garbage collection.
    return () => {
      // @ts-expect-error We assume the types are correct
      const cbIndex = hooks.indexOf(callback);
      if (cbIndex > -1) {
        hooks.splice(cbIndex, 1);
      }
    };
  }

  /** Fire a hook whenever a span starts. */
  public emit(hook: 'spanStart', span: Span): void;

  /** A hook that is called every time before a span is sampled. */
  public emit(
    hook: 'beforeSampling',
    samplingData: {
      spanAttributes: SpanAttributes;
      spanName: string;
      parentSampled?: boolean;
      parentSampleRate?: number;
      parentContext?: SpanContextData;
    },
    samplingDecision: { decision: boolean },
  ): void;

  /** Fire a hook whenever a span ends. */
  public emit(hook: 'spanEnd', span: Span): void;

  /**
   * Fire a hook indicating that an idle span is allowed to auto finish.
   */
  public emit(hook: 'idleSpanEnableAutoFinish', span: Span): void;

  /*
   * Fire a hook event for envelope creation and sending. Expects to be given an envelope as the
   * second argument.
   */
  public emit(hook: 'beforeEnvelope', envelope: Envelope): void;

  /*
   * Fire a hook indicating that stack frame metadata should be applied to the event passed to the hook.
   */
  public emit(hook: 'applyFrameMetadata', event: Event): void;

  /**
   * Fire a hook event before sending an event.
   * This is called right before an event is sent and should not be used to mutate the event.
   * Expects to be given an Event & EventHint as the second/third argument.
   */
  public emit(hook: 'beforeSendEvent', event: Event, hint?: EventHint): void;

  /**
   * Fire a hook event before sending a session/aggregates.
   * Expects to be given the prepared session/aggregates as second argument.
   */
  public emit(hook: 'beforeSendSession', session: Session | SessionAggregates): void;

  /**
   * Fire a hook event to process events before they are passed to (global) event processors.
   * Expects to be given an Event & EventHint as the second/third argument.
   */
  public emit(hook: 'preprocessEvent', event: Event, hint?: EventHint): void;

  /**
   * Fire a hook event to process a user on an event before it is sent to Sentry, after all other processors have run.
   * Expects to be given an Event & EventHint as the second/third argument.
   */
  public emit(hook: 'postprocessEvent', event: Event, hint?: EventHint): void;

  /*
   * Fire a hook event after sending an event. Expects to be given an Event as the
   * second argument.
   */
  public emit(hook: 'afterSendEvent', event: Event, sendResponse: TransportMakeRequestResponse): void;

  /**
   * Fire a hook for when a breadcrumb is added. Expects the breadcrumb as second argument.
   */
  public emit(hook: 'beforeAddBreadcrumb', breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void;

  /**
   * Fire a hook for when a DSC (Dynamic Sampling Context) is created. Expects the DSC as second argument.
   */
  public emit(hook: 'createDsc', dsc: DynamicSamplingContext, rootSpan?: Span): void;

  /**
   * Fire a hook event for after preparing a feedback event. Events to be given
   * a feedback event as the second argument, and an optional options object as
   * third argument.
   */
  public emit(hook: 'beforeSendFeedback', feedback: FeedbackEvent, options?: { includeReplay?: boolean }): void;

  /**
   * Fire a hook event for when the feedback widget is opened in a user's browser
   */
  public emit(hook: 'openFeedbackWidget'): void;

  /**
   * Emit a hook event for browser tracing integrations to trigger a span start for a page load.
   */
  public emit(
    hook: 'startPageLoadSpan',
    options: StartSpanOptions,
    traceOptions?: { sentryTrace?: string | undefined; baggage?: string | undefined },
  ): void;

  /**
   * Emit a hook event for browser tracing integrations to trigger aafter the pageload span was started.
   */
  public emit(hook: 'afterStartPageLoadSpan', span: Span): void;

  /**
   * Emit a hook event for triggering right before a navigation span is started.
   */
  public emit(
    hook: 'beforeStartNavigationSpan',
    options: StartSpanOptions,
    navigationOptions?: { isRedirect?: boolean },
  ): void;

  /**
   * Emit a hook event for browser tracing integrations to trigger a span for a navigation.
   */
  public emit(
    hook: 'startNavigationSpan',
    options: StartSpanOptions,
    navigationOptions?: { isRedirect?: boolean },
  ): void;

  /**
   * Emit a hook event for GraphQL client integration to enhance a span with request data.
   */
  public emit(hook: 'beforeOutgoingRequestSpan', span: Span, hint: XhrBreadcrumbHint | FetchBreadcrumbHint): void;

  /**
   * Emit a hook event for GraphQL client integration to enhance a breadcrumb with request data.
   */
  public emit(
    hook: 'beforeOutgoingRequestBreadcrumb',
    breadcrumb: Breadcrumb,
    hint: XhrBreadcrumbHint | FetchBreadcrumbHint,
  ): void;

  /**
   * Emit a hook event for client flush
   */
  public emit(hook: 'flush'): void;

  /**
   * Emit a hook event for client close
   */
  public emit(hook: 'close'): void;

  /**
   * Emit a hook event for client before capturing a log. This hooks runs before `beforeSendLog` is fired.
   */
  public emit(hook: 'beforeCaptureLog', log: Log): void;

  /**
   * Emit a hook event for client after capturing a log.
   */
  public emit(hook: 'afterCaptureLog', log: Log): void;

  /**
   * Emit a hook event for client flush logs
   */
  public emit(hook: 'flushLogs'): void;

  /**
   * Emit a hook that was previously registered via `on()`.
   */
  public emit(hook: string, ...rest: unknown[]): void {
    const callbacks = this._hooks[hook];
    if (callbacks) {
      callbacks.forEach(callback => callback(...rest));
    }
  }

  /**
   * Send an envelope to Sentry.
   */
  public sendEnvelope(envelope: Envelope): PromiseLike<TransportMakeRequestResponse> {
    this.emit('beforeEnvelope', envelope);

    if (this._isEnabled() && this._transport) {
      return this._transport.send(envelope).then(null, reason => {
        DEBUG_BUILD && debug.error('Error while sending envelope:', reason);
        return reason;
      });
    }

    DEBUG_BUILD && debug.error('Transport disabled');

    return resolvedSyncPromise({});
  }

  /* eslint-enable @typescript-eslint/unified-signatures */

  /** Setup integrations for this client. */
  protected _setupIntegrations(): void {
    const { integrations } = this._options;
    this._integrations = setupIntegrations(this, integrations);
    afterSetupIntegrations(this, integrations);
  }

  /** Updates existing session based on the provided event */
  protected _updateSessionFromEvent(session: Session, event: Event): void {
    let crashed = event.level === 'fatal';
    let errored = false;
    const exceptions = event.exception?.values;

    if (exceptions) {
      errored = true;

      for (const ex of exceptions) {
        const mechanism = ex.mechanism;
        if (mechanism?.handled === false) {
          crashed = true;
          break;
        }
      }
    }

    // A session is updated and that session update is sent in only one of the two following scenarios:
    // 1. Session with non terminal status and 0 errors + an error occurred -> Will set error count to 1 and send update
    // 2. Session with non terminal status and 1 error + a crash occurred -> Will set status crashed and send update
    const sessionNonTerminal = session.status === 'ok';
    const shouldUpdateAndSend = (sessionNonTerminal && session.errors === 0) || (sessionNonTerminal && crashed);

    if (shouldUpdateAndSend) {
      updateSession(session, {
        ...(crashed && { status: 'crashed' }),
        errors: session.errors || Number(errored || crashed),
      });
      this.captureSession(session);
    }
  }

  /**
   * Determine if the client is finished processing. Returns a promise because it will wait `timeout` ms before saying
   * "no" (resolving to `false`) in order to give the client a chance to potentially finish first.
   *
   * @param timeout The time, in ms, after which to resolve to `false` if the client is still busy. Passing `0` (or not
   * passing anything) will make the promise wait as long as it takes for processing to finish before resolving to
   * `true`.
   * @returns A promise which will resolve to `true` if processing is already done or finishes before the timeout, and
   * `false` otherwise
   */
  protected _isClientDoneProcessing(timeout?: number): PromiseLike<boolean> {
    return new SyncPromise(resolve => {
      let ticked: number = 0;
      const tick: number = 1;

      const interval = setInterval(() => {
        if (this._numProcessing == 0) {
          clearInterval(interval);
          resolve(true);
        } else {
          ticked += tick;
          if (timeout && ticked >= timeout) {
            clearInterval(interval);
            resolve(false);
          }
        }
      }, tick);
    });
  }

  /** Determines whether this SDK is enabled and a transport is present. */
  protected _isEnabled(): boolean {
    return this.getOptions().enabled !== false && this._transport !== undefined;
  }

  /**
   * Adds common information to events.
   *
   * The information includes release and environment from `options`,
   * breadcrumbs and context (extra, tags and user) from the scope.
   *
   * Information that is already present in the event is never overwritten. For
   * nested objects, such as the context, keys are merged.
   *
   * @param event The original event.
   * @param hint May contain additional information about the original exception.
   * @param currentScope A scope containing event metadata.
   * @returns A new event with more information.
   */
  protected _prepareEvent(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<Event | null> {
    const options = this.getOptions();
    const integrations = Object.keys(this._integrations);
    if (!hint.integrations && integrations?.length) {
      hint.integrations = integrations;
    }

    this.emit('preprocessEvent', event, hint);

    if (!event.type) {
      isolationScope.setLastEventId(event.event_id || hint.event_id);
    }

    return prepareEvent(options, event, hint, currentScope, this, isolationScope).then(evt => {
      if (evt === null) {
        return evt;
      }

      this.emit('postprocessEvent', evt, hint);

      evt.contexts = {
        trace: getTraceContextFromScope(currentScope),
        ...evt.contexts,
      };

      const dynamicSamplingContext = getDynamicSamplingContextFromScope(this, currentScope);

      evt.sdkProcessingMetadata = {
        dynamicSamplingContext,
        ...evt.sdkProcessingMetadata,
      };

      return evt;
    });
  }

  /**
   * Processes the event and logs an error in case of rejection
   * @param event
   * @param hint
   * @param scope
   */
  protected _captureEvent(
    event: Event,
    hint: EventHint = {},
    currentScope = getCurrentScope(),
    isolationScope = getIsolationScope(),
  ): PromiseLike<string | undefined> {
    if (DEBUG_BUILD && isErrorEvent(event)) {
      debug.log(`Captured error event \`${getPossibleEventMessages(event)[0] || '<unknown>'}\``);
    }

    return this._processEvent(event, hint, currentScope, isolationScope).then(
      finalEvent => {
        return finalEvent.event_id;
      },
      reason => {
        if (DEBUG_BUILD) {
          if (_isDoNotSendEventError(reason)) {
            debug.log(reason.message);
          } else if (_isInternalError(reason)) {
            debug.warn(reason.message);
          } else {
            debug.warn(reason);
          }
        }
        return undefined;
      },
    );
  }

  /**
   * Processes an event (either error or message) and sends it to Sentry.
   *
   * This also adds breadcrumbs and context information to the event. However,
   * platform specific meta data (such as the User's IP address) must be added
   * by the SDK implementor.
   *
   *
   * @param event The event to send to Sentry.
   * @param hint May contain additional information about the original exception.
   * @param currentScope A scope containing event metadata.
   * @returns A SyncPromise that resolves with the event or rejects in case event was/will not be send.
   */
  protected _processEvent(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<Event> {
    const options = this.getOptions();
    const { sampleRate } = options;

    const isTransaction = isTransactionEvent(event);
    const isError = isErrorEvent(event);
    const eventType = event.type || 'error';
    const beforeSendLabel = `before send for type \`${eventType}\``;

    // 1.0 === 100% events are sent
    // 0.0 === 0% events are sent
    // Sampling for transaction happens somewhere else
    const parsedSampleRate = typeof sampleRate === 'undefined' ? undefined : parseSampleRate(sampleRate);
    if (isError && typeof parsedSampleRate === 'number' && Math.random() > parsedSampleRate) {
      this.recordDroppedEvent('sample_rate', 'error');
      return rejectedSyncPromise(
        _makeDoNotSendEventError(
          `Discarding event because it's not included in the random sample (sampling rate = ${sampleRate})`,
        ),
      );
    }

    const dataCategory = (eventType === 'replay_event' ? 'replay' : eventType) satisfies DataCategory;

    return this._prepareEvent(event, hint, currentScope, isolationScope)
      .then(prepared => {
        if (prepared === null) {
          this.recordDroppedEvent('event_processor', dataCategory);
          throw _makeDoNotSendEventError('An event processor returned `null`, will not send event.');
        }

        const isInternalException = hint.data && (hint.data as { __sentry__: boolean }).__sentry__ === true;
        if (isInternalException) {
          return prepared;
        }

        const result = processBeforeSend(this, options, prepared, hint);
        return _validateBeforeSendResult(result, beforeSendLabel);
      })
      .then(processedEvent => {
        if (processedEvent === null) {
          this.recordDroppedEvent('before_send', dataCategory);
          if (isTransaction) {
            const spans = event.spans || [];
            // the transaction itself counts as one span, plus all the child spans that are added
            const spanCount = 1 + spans.length;
            this.recordDroppedEvent('before_send', 'span', spanCount);
          }
          throw _makeDoNotSendEventError(`${beforeSendLabel} returned \`null\`, will not send event.`);
        }

        const session = currentScope.getSession() || isolationScope.getSession();
        if (isError && session) {
          this._updateSessionFromEvent(session, processedEvent);
        }

        if (isTransaction) {
          const spanCountBefore = processedEvent.sdkProcessingMetadata?.spanCountBeforeProcessing || 0;
          const spanCountAfter = processedEvent.spans ? processedEvent.spans.length : 0;

          const droppedSpanCount = spanCountBefore - spanCountAfter;
          if (droppedSpanCount > 0) {
            this.recordDroppedEvent('before_send', 'span', droppedSpanCount);
          }
        }

        // None of the Sentry built event processor will update transaction name,
        // so if the transaction name has been changed by an event processor, we know
        // it has to come from custom event processor added by a user
        const transactionInfo = processedEvent.transaction_info;
        if (isTransaction && transactionInfo && processedEvent.transaction !== event.transaction) {
          const source = 'custom';
          processedEvent.transaction_info = {
            ...transactionInfo,
            source,
          };
        }

        this.sendEvent(processedEvent, hint);
        return processedEvent;
      })
      .then(null, reason => {
        if (_isDoNotSendEventError(reason) || _isInternalError(reason)) {
          throw reason;
        }

        this.captureException(reason, {
          data: {
            __sentry__: true,
          },
          originalException: reason,
        });
        throw _makeInternalError(
          `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.\nReason: ${reason}`,
        );
      });
  }

  /**
   * Occupies the client with processing and event
   */
  protected _process<T>(promise: PromiseLike<T>): void {
    this._numProcessing++;
    void promise.then(
      value => {
        this._numProcessing--;
        return value;
      },
      reason => {
        this._numProcessing--;
        return reason;
      },
    );
  }

  /**
   * Clears outcomes on this client and returns them.
   */
  protected _clearOutcomes(): Outcome[] {
    const outcomes = this._outcomes;
    this._outcomes = {};
    return Object.entries(outcomes).map(([key, quantity]) => {
      const [reason, category] = key.split(':') as [EventDropReason, DataCategory];
      return {
        reason,
        category,
        quantity,
      };
    });
  }

  /**
   * Sends client reports as an envelope.
   */
  protected _flushOutcomes(): void {
    DEBUG_BUILD && debug.log('Flushing outcomes...');

    const outcomes = this._clearOutcomes();

    if (outcomes.length === 0) {
      DEBUG_BUILD && debug.log('No outcomes to send');
      return;
    }

    // This is really the only place where we want to check for a DSN and only send outcomes then
    if (!this._dsn) {
      DEBUG_BUILD && debug.log('No dsn provided, will not send outcomes');
      return;
    }

    DEBUG_BUILD && debug.log('Sending outcomes:', outcomes);

    const envelope = createClientReportEnvelope(outcomes, this._options.tunnel && dsnToString(this._dsn));

    // sendEnvelope should not throw
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.sendEnvelope(envelope);
  }

  /**
   * Creates an {@link Event} from all inputs to `captureException` and non-primitive inputs to `captureMessage`.
   */
  public abstract eventFromException(_exception: unknown, _hint?: EventHint): PromiseLike<Event>;

  /**
   * Creates an {@link Event} from primitive inputs to `captureMessage`.
   */
  public abstract eventFromMessage(
    _message: ParameterizedString,
    _level?: SeverityLevel,
    _hint?: EventHint,
  ): PromiseLike<Event>;
}

/**
 * @deprecated Use `Client` instead. This alias may be removed in a future major version.
 */
// TODO(v10): Remove
export type BaseClient = Client;

/**
 * @deprecated Use `Client` instead. This alias may be removed in a future major version.
 */
// TODO(v10): Remove
export const BaseClient = Client;

/**
 * Verifies that return value of configured `beforeSend` or `beforeSendTransaction` is of expected type, and returns the value if so.
 */
function _validateBeforeSendResult(
  beforeSendResult: PromiseLike<Event | null> | Event | null,
  beforeSendLabel: string,
): PromiseLike<Event | null> | Event | null {
  const invalidValueError = `${beforeSendLabel} must return \`null\` or a valid event.`;
  if (isThenable(beforeSendResult)) {
    return beforeSendResult.then(
      event => {
        if (!isPlainObject(event) && event !== null) {
          throw _makeInternalError(invalidValueError);
        }
        return event;
      },
      e => {
        throw _makeInternalError(`${beforeSendLabel} rejected with ${e}`);
      },
    );
  } else if (!isPlainObject(beforeSendResult) && beforeSendResult !== null) {
    throw _makeInternalError(invalidValueError);
  }
  return beforeSendResult;
}

/**
 * Process the matching `beforeSendXXX` callback.
 */
function processBeforeSend(
  client: Client,
  options: ClientOptions,
  event: Event,
  hint: EventHint,
): PromiseLike<Event | null> | Event | null {
  const { beforeSend, beforeSendTransaction, beforeSendSpan } = options;
  let processedEvent = event;

  if (isErrorEvent(processedEvent) && beforeSend) {
    return beforeSend(processedEvent, hint);
  }

  if (isTransactionEvent(processedEvent)) {
    if (beforeSendSpan) {
      // process root span
      const processedRootSpanJson = beforeSendSpan(convertTransactionEventToSpanJson(processedEvent));
      if (!processedRootSpanJson) {
        showSpanDropWarning();
      } else {
        // update event with processed root span values
        processedEvent = merge(event, convertSpanJsonToTransactionEvent(processedRootSpanJson));
      }

      // process child spans
      if (processedEvent.spans) {
        const processedSpans: SpanJSON[] = [];
        for (const span of processedEvent.spans) {
          const processedSpan = beforeSendSpan(span);
          if (!processedSpan) {
            showSpanDropWarning();
            processedSpans.push(span);
          } else {
            processedSpans.push(processedSpan);
          }
        }
        processedEvent.spans = processedSpans;
      }
    }

    if (beforeSendTransaction) {
      if (processedEvent.spans) {
        // We store the # of spans before processing in SDK metadata,
        // so we can compare it afterwards to determine how many spans were dropped
        const spanCountBefore = processedEvent.spans.length;
        processedEvent.sdkProcessingMetadata = {
          ...event.sdkProcessingMetadata,
          spanCountBeforeProcessing: spanCountBefore,
        };
      }
      return beforeSendTransaction(processedEvent as TransactionEvent, hint);
    }
  }

  return processedEvent;
}

function isErrorEvent(event: Event): event is ErrorEvent {
  return event.type === undefined;
}

function isTransactionEvent(event: Event): event is TransactionEvent {
  return event.type === 'transaction';
}

/** Extract trace information from scope */
export function _getTraceInfoFromScope(
  client: Client,
  scope: Scope | undefined,
): [dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined, traceContext: TraceContext | undefined] {
  if (!scope) {
    return [undefined, undefined];
  }

  return withScope(scope, () => {
    const span = getActiveSpan();
    const traceContext = span ? spanToTraceContext(span) : getTraceContextFromScope(scope);
    const dynamicSamplingContext = span
      ? getDynamicSamplingContextFromSpan(span)
      : getDynamicSamplingContextFromScope(client, scope);
    return [dynamicSamplingContext, traceContext];
  });
}
