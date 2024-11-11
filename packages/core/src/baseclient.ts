/* eslint-disable max-lines */
import type {
  Breadcrumb,
  BreadcrumbHint,
  Client,
  ClientOptions,
  DataCategory,
  DsnComponents,
  DynamicSamplingContext,
  Envelope,
  ErrorEvent,
  Event,
  EventDropReason,
  EventHint,
  EventProcessor,
  FeedbackEvent,
  Integration,
  Outcome,
  ParameterizedString,
  SdkMetadata,
  Session,
  SessionAggregates,
  SeverityLevel,
  Span,
  SpanAttributes,
  SpanContextData,
  SpanJSON,
  StartSpanOptions,
  TransactionEvent,
  Transport,
  TransportMakeRequestResponse,
} from '@sentry/types';
import {
  SentryError,
  SyncPromise,
  addItemToEnvelope,
  checkOrSetAlreadyCaught,
  createAttachmentEnvelopeItem,
  createClientReportEnvelope,
  dropUndefinedKeys,
  dsnToString,
  isParameterizedString,
  isPlainObject,
  isPrimitive,
  isThenable,
  logger,
  makeDsn,
  rejectedSyncPromise,
  resolvedSyncPromise,
  uuid4,
} from '@sentry/utils';

import { getEnvelopeEndpointWithUrlEncodedAuth } from './api';
import { getIsolationScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import { createEventEnvelope, createSessionEnvelope } from './envelope';
import type { IntegrationIndex } from './integration';
import { afterSetupIntegrations } from './integration';
import { setupIntegration, setupIntegrations } from './integration';
import type { Scope } from './scope';
import { updateSession } from './session';
import { getDynamicSamplingContextFromClient } from './tracing/dynamicSamplingContext';
import { parseSampleRate } from './utils/parseSampleRate';
import { prepareEvent } from './utils/prepareEvent';

const ALREADY_SEEN_ERROR = "Not capturing exception because it's already been captured.";

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
 * {@link BaseClient._prepareEvent} to add SDK information and scope data
 * (breadcrumbs and context). To add more custom information, override this
 * method and extend the resulting prepared event.
 *
 * To issue automatically created events (e.g. via instrumentation), use
 * {@link Client.captureEvent}. It will prepare the event and pass it through
 * the callback lifecycle. To issue auto-breadcrumbs, use
 * {@link Client.addBreadcrumb}.
 *
 * @example
 * class NodeClient extends BaseClient<NodeOptions> {
 *   public constructor(options: NodeOptions) {
 *     super(options);
 *   }
 *
 *   // ...
 * }
 */
export abstract class BaseClient<O extends ClientOptions> implements Client<O> {
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
      DEBUG_BUILD && logger.warn('No DSN provided, client will not send events.');
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
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public captureException(exception: any, hint?: EventHint, scope?: Scope): string {
    const eventId = uuid4();

    // ensure we haven't captured this very object before
    if (checkOrSetAlreadyCaught(exception)) {
      DEBUG_BUILD && logger.log(ALREADY_SEEN_ERROR);
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
   * @inheritDoc
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
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint, currentScope?: Scope): string {
    const eventId = uuid4();

    // ensure we haven't captured this very object before
    if (hint && hint.originalException && checkOrSetAlreadyCaught(hint.originalException)) {
      DEBUG_BUILD && logger.log(ALREADY_SEEN_ERROR);
      return eventId;
    }

    const hintWithEventId = {
      event_id: eventId,
      ...hint,
    };

    const sdkProcessingMetadata = event.sdkProcessingMetadata || {};
    const capturedSpanScope: Scope | undefined = sdkProcessingMetadata.capturedSpanScope;

    this._process(this._captureEvent(event, hintWithEventId, capturedSpanScope || currentScope));

    return hintWithEventId.event_id;
  }

  /**
   * @inheritDoc
   */
  public captureSession(session: Session): void {
    if (!(typeof session.release === 'string')) {
      DEBUG_BUILD && logger.warn('Discarded session because of missing or non-string release');
    } else {
      this.sendSession(session);
      // After sending, we set init false to indicate it's not the first occurrence
      updateSession(session, { init: false });
    }
  }

  /**
   * @inheritDoc
   */
  public getDsn(): DsnComponents | undefined {
    return this._dsn;
  }

  /**
   * @inheritDoc
   */
  public getOptions(): O {
    return this._options;
  }

  /**
   * @see SdkMetadata in @sentry/types
   *
   * @return The metadata of the SDK
   */
  public getSdkMetadata(): SdkMetadata | undefined {
    return this._options._metadata;
  }

  /**
   * @inheritDoc
   */
  public getTransport(): Transport | undefined {
    return this._transport;
  }

  /**
   * @inheritDoc
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
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this.flush(timeout).then(result => {
      this.getOptions().enabled = false;
      this.emit('close');
      return result;
    });
  }

  /** Get all installed event processors. */
  public getEventProcessors(): EventProcessor[] {
    return this._eventProcessors;
  }

  /** @inheritDoc */
  public addEventProcessor(eventProcessor: EventProcessor): void {
    this._eventProcessors.push(eventProcessor);
  }

  /** @inheritdoc */
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
   * @returns The installed integration or `undefined` if no integration with that `name` was installed.
   */
  public getIntegrationByName<T extends Integration = Integration>(integrationName: string): T | undefined {
    return this._integrations[integrationName] as T | undefined;
  }

  /**
   * @inheritDoc
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
   * @inheritDoc
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
   * @inheritDoc
   */
  public sendSession(session: Session | SessionAggregates): void {
    const env = createSessionEnvelope(session, this._dsn, this._options._metadata, this._options.tunnel);

    // sendEnvelope should not throw
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.sendEnvelope(env);
  }

  /**
   * @inheritDoc
   */
  public recordDroppedEvent(reason: EventDropReason, category: DataCategory, eventOrCount?: Event | number): void {
    if (this._options.sendClientReports) {
      // TODO v9: We do not need the `event` passed as third argument anymore, and can possibly remove this overload
      // If event is passed as third argument, we assume this is a count of 1
      const count = typeof eventOrCount === 'number' ? eventOrCount : 1;

      // We want to track each category (error, transaction, session, replay_event) separately
      // but still keep the distinction between different type of outcomes.
      // We could use nested maps, but it's much easier to read and type this way.
      // A correct type for map-based implementation if we want to go that route
      // would be `Partial<Record<SentryRequestType, Partial<Record<Outcome, number>>>>`
      // With typescript 4.1 we could even use template literal types
      const key = `${reason}:${category}`;
      DEBUG_BUILD && logger.log(`Recording outcome: "${key}"${count > 1 ? ` (${count} times)` : ''}`);
      this._outcomes[key] = (this._outcomes[key] || 0) + count;
    }
  }

  // Keep on() & emit() signatures in sync with types' client.ts interface
  /* eslint-disable @typescript-eslint/unified-signatures */

  /** @inheritdoc */
  public on(hook: 'spanStart', callback: (span: Span) => void): () => void;

  /** @inheritdoc */
  public on(hook: 'spanEnd', callback: (span: Span) => void): () => void;

  /** @inheritdoc */
  public on(hook: 'idleSpanEnableAutoFinish', callback: (span: Span) => void): () => void;

  /** @inheritdoc */
  public on(hook: 'beforeEnvelope', callback: (envelope: Envelope) => void): () => void;

  /** @inheritdoc */
  public on(hook: 'beforeSendEvent', callback: (event: Event, hint?: EventHint) => void): () => void;

  /** @inheritdoc */
  public on(hook: 'preprocessEvent', callback: (event: Event, hint?: EventHint) => void): () => void;

  /** @inheritdoc */
  public on(
    hook: 'afterSendEvent',
    callback: (event: Event, sendResponse: TransportMakeRequestResponse) => void,
  ): () => void;

  /** @inheritdoc */
  public on(hook: 'beforeAddBreadcrumb', callback: (breadcrumb: Breadcrumb, hint?: BreadcrumbHint) => void): () => void;

  /** @inheritdoc */
  public on(hook: 'createDsc', callback: (dsc: DynamicSamplingContext, rootSpan?: Span) => void): () => void;

  /** @inheritdoc */
  public on(
    hook: 'beforeSendFeedback',
    callback: (feedback: FeedbackEvent, options?: { includeReplay: boolean }) => void,
  ): () => void;

  /** @inheritdoc */
  public on(
    hook: 'beforeSampling',
    callback: (
      samplingData: {
        spanAttributes: SpanAttributes;
        spanName: string;
        parentSampled?: boolean;
        parentContext?: SpanContextData;
      },
      samplingDecision: { decision: boolean },
    ) => void,
  ): void;

  /** @inheritdoc */
  public on(
    hook: 'startPageLoadSpan',
    callback: (
      options: StartSpanOptions,
      traceOptions?: { sentryTrace?: string | undefined; baggage?: string | undefined },
    ) => void,
  ): () => void;

  /** @inheritdoc */
  public on(hook: 'startNavigationSpan', callback: (options: StartSpanOptions) => void): () => void;

  public on(hook: 'flush', callback: () => void): () => void;

  public on(hook: 'close', callback: () => void): () => void;

  public on(hook: 'applyFrameMetadata', callback: (event: Event) => void): () => void;

  /** @inheritdoc */
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

  /** @inheritdoc */
  public emit(
    hook: 'beforeSampling',
    samplingData: {
      spanAttributes: SpanAttributes;
      spanName: string;
      parentSampled?: boolean;
      parentContext?: SpanContextData;
    },
    samplingDecision: { decision: boolean },
  ): void;

  /** @inheritdoc */
  public emit(hook: 'spanStart', span: Span): void;

  /** @inheritdoc */
  public emit(hook: 'spanEnd', span: Span): void;

  /** @inheritdoc */
  public emit(hook: 'idleSpanEnableAutoFinish', span: Span): void;

  /** @inheritdoc */
  public emit(hook: 'beforeEnvelope', envelope: Envelope): void;

  /** @inheritdoc */
  public emit(hook: 'beforeSendEvent', event: Event, hint?: EventHint): void;

  /** @inheritdoc */
  public emit(hook: 'preprocessEvent', event: Event, hint?: EventHint): void;

  /** @inheritdoc */
  public emit(hook: 'afterSendEvent', event: Event, sendResponse: TransportMakeRequestResponse): void;

  /** @inheritdoc */
  public emit(hook: 'beforeAddBreadcrumb', breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void;

  /** @inheritdoc */
  public emit(hook: 'createDsc', dsc: DynamicSamplingContext, rootSpan?: Span): void;

  /** @inheritdoc */
  public emit(hook: 'beforeSendFeedback', feedback: FeedbackEvent, options?: { includeReplay: boolean }): void;

  /** @inheritdoc */
  public emit(
    hook: 'startPageLoadSpan',
    options: StartSpanOptions,
    traceOptions?: { sentryTrace?: string | undefined; baggage?: string | undefined },
  ): void;

  /** @inheritdoc */
  public emit(hook: 'startNavigationSpan', options: StartSpanOptions): void;

  /** @inheritdoc */
  public emit(hook: 'flush'): void;

  /** @inheritdoc */
  public emit(hook: 'close'): void;

  /** @inheritdoc */
  public emit(hook: 'applyFrameMetadata', event: Event): void;

  /** @inheritdoc */
  public emit(hook: string, ...rest: unknown[]): void {
    const callbacks = this._hooks[hook];
    if (callbacks) {
      callbacks.forEach(callback => callback(...rest));
    }
  }

  /**
   * @inheritdoc
   */
  public sendEnvelope(envelope: Envelope): PromiseLike<TransportMakeRequestResponse> {
    this.emit('beforeEnvelope', envelope);

    if (this._isEnabled() && this._transport) {
      return this._transport.send(envelope).then(null, reason => {
        DEBUG_BUILD && logger.error('Error while sending envelope:', reason);
        return reason;
      });
    }

    DEBUG_BUILD && logger.error('Transport disabled');

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
    let crashed = false;
    let errored = false;
    const exceptions = event.exception && event.exception.values;

    if (exceptions) {
      errored = true;

      for (const ex of exceptions) {
        const mechanism = ex.mechanism;
        if (mechanism && mechanism.handled === false) {
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
    currentScope?: Scope,
    isolationScope = getIsolationScope(),
  ): PromiseLike<Event | null> {
    const options = this.getOptions();
    const integrations = Object.keys(this._integrations);
    if (!hint.integrations && integrations.length > 0) {
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

      const propagationContext = {
        ...isolationScope.getPropagationContext(),
        ...(currentScope ? currentScope.getPropagationContext() : undefined),
      };

      const trace = evt.contexts && evt.contexts.trace;
      if (!trace && propagationContext) {
        const { traceId: trace_id, spanId, parentSpanId, dsc } = propagationContext;
        evt.contexts = {
          trace: dropUndefinedKeys({
            trace_id,
            span_id: spanId,
            parent_span_id: parentSpanId,
          }),
          ...evt.contexts,
        };

        const dynamicSamplingContext = dsc ? dsc : getDynamicSamplingContextFromClient(trace_id, this);

        evt.sdkProcessingMetadata = {
          dynamicSamplingContext,
          ...evt.sdkProcessingMetadata,
        };
      }
      return evt;
    });
  }

  /**
   * Processes the event and logs an error in case of rejection
   * @param event
   * @param hint
   * @param scope
   */
  protected _captureEvent(event: Event, hint: EventHint = {}, scope?: Scope): PromiseLike<string | undefined> {
    return this._processEvent(event, hint, scope).then(
      finalEvent => {
        return finalEvent.event_id;
      },
      reason => {
        if (DEBUG_BUILD) {
          // If something's gone wrong, log the error as a warning. If it's just us having used a `SentryError` for
          // control flow, log just the message (no stack) as a log-level log.
          const sentryError = reason as SentryError;
          if (sentryError.logLevel === 'log') {
            logger.log(sentryError.message);
          } else {
            logger.warn(sentryError);
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
  protected _processEvent(event: Event, hint: EventHint, currentScope?: Scope): PromiseLike<Event> {
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
      this.recordDroppedEvent('sample_rate', 'error', event);
      return rejectedSyncPromise(
        new SentryError(
          `Discarding event because it's not included in the random sample (sampling rate = ${sampleRate})`,
          'log',
        ),
      );
    }

    const dataCategory: DataCategory = eventType === 'replay_event' ? 'replay' : eventType;

    const sdkProcessingMetadata = event.sdkProcessingMetadata || {};
    const capturedSpanIsolationScope: Scope | undefined = sdkProcessingMetadata.capturedSpanIsolationScope;

    return this._prepareEvent(event, hint, currentScope, capturedSpanIsolationScope)
      .then(prepared => {
        if (prepared === null) {
          this.recordDroppedEvent('event_processor', dataCategory, event);
          throw new SentryError('An event processor returned `null`, will not send event.', 'log');
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
          this.recordDroppedEvent('before_send', dataCategory, event);
          if (isTransaction) {
            const spans = event.spans || [];
            // the transaction itself counts as one span, plus all the child spans that are added
            const spanCount = 1 + spans.length;
            this.recordDroppedEvent('before_send', 'span', spanCount);
          }
          throw new SentryError(`${beforeSendLabel} returned \`null\`, will not send event.`, 'log');
        }

        const session = currentScope && currentScope.getSession();
        if (!isTransaction && session) {
          this._updateSessionFromEvent(session, processedEvent);
        }

        if (isTransaction) {
          const spanCountBefore =
            (processedEvent.sdkProcessingMetadata && processedEvent.sdkProcessingMetadata.spanCountBeforeProcessing) ||
            0;
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
        if (reason instanceof SentryError) {
          throw reason;
        }

        this.captureException(reason, {
          data: {
            __sentry__: true,
          },
          originalException: reason,
        });
        throw new SentryError(
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
    DEBUG_BUILD && logger.log('Flushing outcomes...');

    const outcomes = this._clearOutcomes();

    if (outcomes.length === 0) {
      DEBUG_BUILD && logger.log('No outcomes to send');
      return;
    }

    // This is really the only place where we want to check for a DSN and only send outcomes then
    if (!this._dsn) {
      DEBUG_BUILD && logger.log('No dsn provided, will not send outcomes');
      return;
    }

    DEBUG_BUILD && logger.log('Sending outcomes:', outcomes);

    const envelope = createClientReportEnvelope(outcomes, this._options.tunnel && dsnToString(this._dsn));

    // sendEnvelope should not throw
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.sendEnvelope(envelope);
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public abstract eventFromException(_exception: any, _hint?: EventHint): PromiseLike<Event>;

  /**
   * @inheritDoc
   */
  public abstract eventFromMessage(
    _message: ParameterizedString,
    _level?: SeverityLevel,
    _hint?: EventHint,
  ): PromiseLike<Event>;
}

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
          throw new SentryError(invalidValueError);
        }
        return event;
      },
      e => {
        throw new SentryError(`${beforeSendLabel} rejected with ${e}`);
      },
    );
  } else if (!isPlainObject(beforeSendResult) && beforeSendResult !== null) {
    throw new SentryError(invalidValueError);
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

  if (isErrorEvent(event) && beforeSend) {
    return beforeSend(event, hint);
  }

  if (isTransactionEvent(event)) {
    if (event.spans && beforeSendSpan) {
      const processedSpans: SpanJSON[] = [];
      for (const span of event.spans) {
        const processedSpan = beforeSendSpan(span);
        if (processedSpan) {
          processedSpans.push(processedSpan);
        } else {
          client.recordDroppedEvent('before_send', 'span');
        }
      }
      event.spans = processedSpans;
    }

    if (beforeSendTransaction) {
      if (event.spans) {
        // We store the # of spans before processing in SDK metadata,
        // so we can compare it afterwards to determine how many spans were dropped
        const spanCountBefore = event.spans.length;
        event.sdkProcessingMetadata = {
          ...event.sdkProcessingMetadata,
          spanCountBeforeProcessing: spanCountBefore,
        };
      }
      return beforeSendTransaction(event, hint);
    }
  }

  return event;
}

function isErrorEvent(event: Event): event is ErrorEvent {
  return event.type === undefined;
}

function isTransactionEvent(event: Event): event is TransactionEvent {
  return event.type === 'transaction';
}
