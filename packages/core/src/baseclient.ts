/* eslint-disable max-lines */
import { Scope, Session } from '@sentry/hub';
import {
  Client,
  ClientOptions,
  DsnComponents,
  Event,
  EventHint,
  Integration,
  IntegrationClass,
  Severity,
  SeverityLevel,
  Transport,
} from '@sentry/types';
import {
  checkOrSetAlreadyCaught,
  dateTimestampInSeconds,
  isPlainObject,
  isPrimitive,
  isThenable,
  logger,
  makeDsn,
  normalize,
  rejectedSyncPromise,
  resolvedSyncPromise,
  SentryError,
  SyncPromise,
  truncate,
  uuid4,
} from '@sentry/utils';

import { APIDetails, initAPIDetails } from './api';
import { IS_DEBUG_BUILD } from './flags';
import { IntegrationIndex, setupIntegrations } from './integration';
import { createEventEnvelope, createSessionEnvelope } from './request';
import { NewTransport } from './transports/base';

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

  /** Array of set up integrations. */
  protected _integrations: IntegrationIndex = {};

  /** Indicates whether this client's integrations have been set up. */
  protected _integrationsInitialized: boolean = false;

  /** Number of calls being processed */
  protected _numProcessing: number = 0;

  /** Cached transport used internally. */
  protected _transport: Transport;

  /** New v7 Transport that is initialized alongside the old one */
  protected _newTransport?: NewTransport;

  /**
   * Initializes this client instance.
   *
   * @param options Options for the client.
   * @param transport The (old) Transport instance for the client to use (TODO(v7): remove)
   * @param newTransport The NewTransport instance for the client to use
   */
  protected constructor(options: O, transport: Transport, newTransport?: NewTransport) {
    this._options = options;

    if (options.dsn) {
      this._dsn = makeDsn(options.dsn);
    } else {
      IS_DEBUG_BUILD && logger.warn('No DSN provided, client will not do anything.');
    }

    // TODO(v7): remove old transport
    this._transport = transport;
    this._newTransport = newTransport;

    // TODO(v7): refactor this to keep metadata/api outside of transport. This hack is used to
    //           satisfy tests until we move to NewTransport where we have to revisit this.
    (this._transport as unknown as { _api: Partial<APIDetails> })._api = {
      ...((this._transport as unknown as { _api: Partial<APIDetails> })._api || {}),
      metadata: options._metadata || {},
    };
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public captureException(exception: any, hint?: EventHint, scope?: Scope): string | undefined {
    // ensure we haven't captured this very object before
    if (checkOrSetAlreadyCaught(exception)) {
      IS_DEBUG_BUILD && logger.log(ALREADY_SEEN_ERROR);
      return;
    }

    let eventId: string | undefined = hint && hint.event_id;

    this._process(
      this.eventFromException(exception, hint)
        .then(event => this._captureEvent(event, hint, scope))
        .then(result => {
          eventId = result;
        }),
    );

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level?: Severity | SeverityLevel,
    hint?: EventHint,
    scope?: Scope,
  ): string | undefined {
    let eventId: string | undefined = hint && hint.event_id;

    const promisedEvent = isPrimitive(message)
      ? this.eventFromMessage(String(message), level, hint)
      : this.eventFromException(message, hint);

    this._process(
      promisedEvent
        .then(event => this._captureEvent(event, hint, scope))
        .then(result => {
          eventId = result;
        }),
    );

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string | undefined {
    // ensure we haven't captured this very object before
    if (hint && hint.originalException && checkOrSetAlreadyCaught(hint.originalException)) {
      IS_DEBUG_BUILD && logger.log(ALREADY_SEEN_ERROR);
      return;
    }

    let eventId: string | undefined = hint && hint.event_id;

    this._process(
      this._captureEvent(event, hint, scope).then(result => {
        eventId = result;
      }),
    );

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureSession(session: Session): void {
    if (!this._isEnabled()) {
      IS_DEBUG_BUILD && logger.warn('SDK not enabled, will not capture session.');
      return;
    }

    if (!(typeof session.release === 'string')) {
      IS_DEBUG_BUILD && logger.warn('Discarded session because of missing or non-string release');
    } else {
      this._sendSession(session);
      // After sending, we set init false to indicate it's not the first occurrence
      session.update({ init: false });
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
   * @inheritDoc
   */
  public getTransport(): Transport {
    return this._transport;
  }

  /**
   * @inheritDoc
   */
  public flush(timeout?: number): PromiseLike<boolean> {
    return this._isClientDoneProcessing(timeout).then(clientFinished => {
      return this.getTransport()
        .close(timeout)
        .then(transportFlushed => clientFinished && transportFlushed);
    });
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this.flush(timeout).then(result => {
      this.getOptions().enabled = false;
      return result;
    });
  }

  /**
   * Sets up the integrations
   */
  public setupIntegrations(): void {
    if (this._isEnabled() && !this._integrationsInitialized) {
      this._integrations = setupIntegrations(this._options.integrations);
      this._integrationsInitialized = true;
    }
  }

  /**
   * @inheritDoc
   */
  public getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
    try {
      return (this._integrations[integration.id] as T) || null;
    } catch (_oO) {
      IS_DEBUG_BUILD && logger.warn(`Cannot retrieve integration ${integration.id} from the current Client`);
      return null;
    }
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): void {
    // TODO(v7): Remove the if-else
    if (
      this._newTransport &&
      this._options.dsn &&
      this._options._experiments &&
      this._options._experiments.newTransport
    ) {
      const api = initAPIDetails(this._options.dsn, this._options._metadata, this._options.tunnel);
      const env = createEventEnvelope(event, api);
      void this._newTransport.send(env).then(null, reason => {
        IS_DEBUG_BUILD && logger.error('Error while sending event:', reason);
      });
    } else {
      void this._transport.sendEvent(event).then(null, reason => {
        IS_DEBUG_BUILD && logger.error('Error while sending event:', reason);
      });
    }
  }

  /**
   * @inheritDoc
   */
  public sendSession(session: Session): void {
    if (!this._transport.sendSession) {
      IS_DEBUG_BUILD && logger.warn("Dropping session because custom transport doesn't implement sendSession");
      return;
    }

    // TODO(v7): Remove the if-else
    if (
      this._newTransport &&
      this._options.dsn &&
      this._options._experiments &&
      this._options._experiments.newTransport
    ) {
      const api = initAPIDetails(this._options.dsn, this._options._metadata, this._options.tunnel);
      const [env] = createSessionEnvelope(session, api);
      void this._newTransport.send(env).then(null, reason => {
        IS_DEBUG_BUILD && logger.error('Error while sending session:', reason);
      });
    } else {
      void this._transport.sendSession(session).then(null, reason => {
        IS_DEBUG_BUILD && logger.error('Error while sending session:', reason);
      });
    }
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
      session.update({
        ...(crashed && { status: 'crashed' }),
        errors: session.errors || Number(errored || crashed),
      });
      this.captureSession(session);
    }
  }

  /** Deliver captured session to Sentry */
  // TODO(v7): should this be deleted?
  protected _sendSession(session: Session): void {
    this.sendSession(session);
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

  /** Determines whether this SDK is enabled and a valid Dsn is present. */
  protected _isEnabled(): boolean {
    return this.getOptions().enabled !== false && this._dsn !== undefined;
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
   * @param scope A scope containing event metadata.
   * @returns A new event with more information.
   */
  protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): PromiseLike<Event | null> {
    const { normalizeDepth = 3, normalizeMaxBreadth = 1_000 } = this.getOptions();
    const prepared: Event = {
      ...event,
      event_id: event.event_id || (hint && hint.event_id ? hint.event_id : uuid4()),
      timestamp: event.timestamp || dateTimestampInSeconds(),
    };

    this._applyClientOptions(prepared);
    this._applyIntegrationsMetadata(prepared);

    // If we have scope given to us, use it as the base for further modifications.
    // This allows us to prevent unnecessary copying of data if `captureContext` is not provided.
    let finalScope = scope;
    if (hint && hint.captureContext) {
      finalScope = Scope.clone(finalScope).update(hint.captureContext);
    }

    // We prepare the result here with a resolved Event.
    let result = resolvedSyncPromise<Event | null>(prepared);

    // This should be the last thing called, since we want that
    // {@link Hub.addEventProcessor} gets the finished prepared event.
    if (finalScope) {
      // In case we have a hub we reassign it.
      result = finalScope.applyToEvent(prepared, hint);
    }

    return result.then(evt => {
      if (evt) {
        // TODO this is more of the hack trying to solve https://github.com/getsentry/sentry-javascript/issues/2809
        // it is only attached as extra data to the event if the event somehow skips being normalized
        evt.sdkProcessingMetadata = {
          ...evt.sdkProcessingMetadata,
          normalizeDepth: `${normalize(normalizeDepth)} (${typeof normalizeDepth})`,
        };
      }
      if (typeof normalizeDepth === 'number' && normalizeDepth > 0) {
        return this._normalizeEvent(evt, normalizeDepth, normalizeMaxBreadth);
      }
      return evt;
    });
  }

  /**
   * Applies `normalize` function on necessary `Event` attributes to make them safe for serialization.
   * Normalized keys:
   * - `breadcrumbs.data`
   * - `user`
   * - `contexts`
   * - `extra`
   * @param event Event
   * @returns Normalized event
   */
  protected _normalizeEvent(event: Event | null, depth: number, maxBreadth: number): Event | null {
    if (!event) {
      return null;
    }

    const normalized = {
      ...event,
      ...(event.breadcrumbs && {
        breadcrumbs: event.breadcrumbs.map(b => ({
          ...b,
          ...(b.data && {
            data: normalize(b.data, depth, maxBreadth),
          }),
        })),
      }),
      ...(event.user && {
        user: normalize(event.user, depth, maxBreadth),
      }),
      ...(event.contexts && {
        contexts: normalize(event.contexts, depth, maxBreadth),
      }),
      ...(event.extra && {
        extra: normalize(event.extra, depth, maxBreadth),
      }),
    };
    // event.contexts.trace stores information about a Transaction. Similarly,
    // event.spans[] stores information about child Spans. Given that a
    // Transaction is conceptually a Span, normalization should apply to both
    // Transactions and Spans consistently.
    // For now the decision is to skip normalization of Transactions and Spans,
    // so this block overwrites the normalized event to add back the original
    // Transaction information prior to normalization.
    if (event.contexts && event.contexts.trace) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      normalized.contexts.trace = event.contexts.trace;
    }

    normalized.sdkProcessingMetadata = { ...normalized.sdkProcessingMetadata, baseClientNormalized: true };

    return normalized;
  }

  /**
   *  Enhances event using the client configuration.
   *  It takes care of all "static" values like environment, release and `dist`,
   *  as well as truncating overly long values.
   * @param event event instance to be enhanced
   */
  protected _applyClientOptions(event: Event): void {
    const options = this.getOptions();
    const { environment, release, dist, maxValueLength = 250 } = options;

    if (!('environment' in event)) {
      event.environment = 'environment' in options ? environment : 'production';
    }

    if (event.release === undefined && release !== undefined) {
      event.release = release;
    }

    if (event.dist === undefined && dist !== undefined) {
      event.dist = dist;
    }

    if (event.message) {
      event.message = truncate(event.message, maxValueLength);
    }

    const exception = event.exception && event.exception.values && event.exception.values[0];
    if (exception && exception.value) {
      exception.value = truncate(exception.value, maxValueLength);
    }

    const request = event.request;
    if (request && request.url) {
      request.url = truncate(request.url, maxValueLength);
    }
  }

  /**
   * This function adds all used integrations to the SDK info in the event.
   * @param event The event that will be filled with all integrations.
   */
  protected _applyIntegrationsMetadata(event: Event): void {
    const integrationsArray = Object.keys(this._integrations);
    if (integrationsArray.length > 0) {
      event.sdk = event.sdk || {};
      event.sdk.integrations = [...(event.sdk.integrations || []), ...integrationsArray];
    }
  }

  /**
   * Sends the passed event
   * @param event The Sentry event to send
   */
  // TODO(v7): refactor: get rid of method?
  protected _sendEvent(event: Event): void {
    this.sendEvent(event);
  }

  /**
   * Processes the event and logs an error in case of rejection
   * @param event
   * @param hint
   * @param scope
   */
  protected _captureEvent(event: Event, hint?: EventHint, scope?: Scope): PromiseLike<string | undefined> {
    return this._processEvent(event, hint, scope).then(
      finalEvent => {
        return finalEvent.event_id;
      },
      reason => {
        IS_DEBUG_BUILD && logger.error(reason);
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
   * @param scope A scope containing event metadata.
   * @returns A SyncPromise that resolves with the event or rejects in case event was/will not be send.
   */
  protected _processEvent(event: Event, hint?: EventHint, scope?: Scope): PromiseLike<Event> {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { beforeSend, sampleRate } = this.getOptions();
    const transport = this.getTransport();

    type RecordLostEvent = NonNullable<Transport['recordLostEvent']>;
    type RecordLostEventParams = Parameters<RecordLostEvent>;

    function recordLostEvent(outcome: RecordLostEventParams[0], category: RecordLostEventParams[1]): void {
      if (transport.recordLostEvent) {
        transport.recordLostEvent(outcome, category);
      }
    }

    if (!this._isEnabled()) {
      return rejectedSyncPromise(new SentryError('SDK not enabled, will not capture event.'));
    }

    const isTransaction = event.type === 'transaction';
    // 1.0 === 100% events are sent
    // 0.0 === 0% events are sent
    // Sampling for transaction happens somewhere else
    if (!isTransaction && typeof sampleRate === 'number' && Math.random() > sampleRate) {
      recordLostEvent('sample_rate', 'event');
      return rejectedSyncPromise(
        new SentryError(
          `Discarding event because it's not included in the random sample (sampling rate = ${sampleRate})`,
        ),
      );
    }

    return this._prepareEvent(event, scope, hint)
      .then(prepared => {
        if (prepared === null) {
          recordLostEvent('event_processor', event.type || 'event');
          throw new SentryError('An event processor returned null, will not send event.');
        }

        const isInternalException = hint && hint.data && (hint.data as { __sentry__: boolean }).__sentry__ === true;
        if (isInternalException || isTransaction || !beforeSend) {
          return prepared;
        }

        const beforeSendResult = beforeSend(prepared, hint);
        return _ensureBeforeSendRv(beforeSendResult);
      })
      .then(processedEvent => {
        if (processedEvent === null) {
          recordLostEvent('before_send', event.type || 'event');
          throw new SentryError('`beforeSend` returned `null`, will not send event.');
        }

        const session = scope && scope.getSession && scope.getSession();
        if (!isTransaction && session) {
          this._updateSessionFromEvent(session, processedEvent);
        }

        this._sendEvent(processedEvent);
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
          originalException: reason as Error,
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
    this._numProcessing += 1;
    void promise.then(
      value => {
        this._numProcessing -= 1;
        return value;
      },
      reason => {
        this._numProcessing -= 1;
        return reason;
      },
    );
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public abstract eventFromException(_exception: any, _hint?: EventHint): PromiseLike<Event>;

  /**
   * @inheritDoc
   */
  public abstract eventFromMessage(
    _message: string,
    // eslint-disable-next-line deprecation/deprecation
    _level?: Severity | SeverityLevel,
    _hint?: EventHint,
  ): PromiseLike<Event>;
}

/**
 * Verifies that return value of configured `beforeSend` is of expected type.
 */
function _ensureBeforeSendRv(rv: PromiseLike<Event | null> | Event | null): PromiseLike<Event | null> | Event | null {
  const nullErr = '`beforeSend` method has to return `null` or a valid event.';
  if (isThenable(rv)) {
    return rv.then(
      event => {
        if (!(isPlainObject(event) || event === null)) {
          throw new SentryError(nullErr);
        }
        return event;
      },
      e => {
        throw new SentryError(`beforeSend rejected with ${e}`);
      },
    );
  } else if (!(isPlainObject(rv) || rv === null)) {
    throw new SentryError(nullErr);
  }
  return rv;
}
