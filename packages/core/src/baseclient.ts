import { Scope } from '@sentry/hub';
import { Client, Event, EventHint, Integration, IntegrationClass, Options, Severity } from '@sentry/types';
import {
  Dsn,
  isPrimitive,
  isThenable,
  logger,
  normalize,
  SyncPromise,
  timestampWithMs,
  truncate,
  uuid4,
} from '@sentry/utils';

import { Backend, BackendClass } from './basebackend';
import { IntegrationIndex, setupIntegrations } from './integration';

/**
 * Base implementation for all JavaScript SDK clients.
 *
 * Call the constructor with the corresponding backend constructor and options
 * specific to the client subclass. To access these options later, use
 * {@link Client.getOptions}. Also, the Backend instance is available via
 * {@link Client.getBackend}.
 *
 * If a Dsn is specified in the options, it will be parsed and stored. Use
 * {@link Client.getDsn} to retrieve the Dsn at any moment. In case the Dsn is
 * invalid, the constructor will throw a {@link SentryException}. Note that
 * without a valid Dsn, the SDK will not send any events to Sentry.
 *
 * Before sending an event via the backend, it is passed through
 * {@link BaseClient.prepareEvent} to add SDK information and scope data
 * (breadcrumbs and context). To add more custom information, override this
 * method and extend the resulting prepared event.
 *
 * To issue automatically created events (e.g. via instrumentation), use
 * {@link Client.captureEvent}. It will prepare the event and pass it through
 * the callback lifecycle. To issue auto-breadcrumbs, use
 * {@link Client.addBreadcrumb}.
 *
 * @example
 * class NodeClient extends BaseClient<NodeBackend, NodeOptions> {
 *   public constructor(options: NodeOptions) {
 *     super(NodeBackend, options);
 *   }
 *
 *   // ...
 * }
 */
export abstract class BaseClient<B extends Backend, O extends Options> implements Client<O> {
  /**
   * The backend used to physically interact in the environment. Usually, this
   * will correspond to the client. When composing SDKs, however, the Backend
   * from the root SDK will be used.
   */
  protected readonly _backend: B;

  /** Options passed to the SDK. */
  protected readonly _options: O;

  /** The client Dsn, if specified in options. Without this Dsn, the SDK will be disabled. */
  protected readonly _dsn?: Dsn;

  /** Array of used integrations. */
  protected _integrations: IntegrationIndex = {};

  /** Is the client still processing a call? */
  protected _processing: boolean = false;

  /**
   * Initializes this client instance.
   *
   * @param backendClass A constructor function to create the backend.
   * @param options Options for the client.
   */
  protected constructor(backendClass: BackendClass<B, O>, options: O) {
    this._backend = new backendClass(options);
    this._options = options;

    if (options.dsn) {
      this._dsn = new Dsn(options.dsn);
    }
  }

  /**
   * @inheritDoc
   */
  public captureException(exception: any, hint?: EventHint, scope?: Scope): string | undefined {
    let eventId: string | undefined = hint && hint.event_id;
    this._processing = true;

    this._getBackend()
      .eventFromException(exception, hint)
      .then(event => {
        eventId = this.captureEvent(event, hint, scope);
      });

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureMessage(message: string, level?: Severity, hint?: EventHint, scope?: Scope): string | undefined {
    let eventId: string | undefined = hint && hint.event_id;
    this._processing = true;

    const promisedEvent = isPrimitive(message)
      ? this._getBackend().eventFromMessage(`${message}`, level, hint)
      : this._getBackend().eventFromException(message, hint);

    promisedEvent.then(event => {
      eventId = this.captureEvent(event, hint, scope);
    });

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string | undefined {
    let eventId: string | undefined = hint && hint.event_id;
    this._processing = true;

    this._processEvent(event, hint, scope)
      .then(finalEvent => {
        // We need to check for finalEvent in case beforeSend returned null
        eventId = finalEvent && finalEvent.event_id;
        this._processing = false;
      })
      .then(null, reason => {
        logger.error(reason);
        this._processing = false;
      });

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public getDsn(): Dsn | undefined {
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
  public flush(timeout?: number): PromiseLike<boolean> {
    return this._isClientProcessing(timeout).then(status => {
      clearInterval(status.interval);
      return this._getBackend()
        .getTransport()
        .close(timeout)
        .then(transportFlushed => status.ready && transportFlushed);
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
    if (this._isEnabled()) {
      this._integrations = setupIntegrations(this._options);
    }
  }

  /**
   * @inheritDoc
   */
  public getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
    try {
      return (this._integrations[integration.id] as T) || null;
    } catch (_oO) {
      logger.warn(`Cannot retrieve integration ${integration.id} from the current Client`);
      return null;
    }
  }

  /** Waits for the client to be done with processing. */
  protected _isClientProcessing(timeout?: number): PromiseLike<{ ready: boolean; interval: number }> {
    return new SyncPromise<{ ready: boolean; interval: number }>(resolve => {
      let ticked: number = 0;
      const tick: number = 1;

      let interval = 0;
      clearInterval(interval);

      interval = (setInterval(() => {
        if (!this._processing) {
          resolve({
            interval,
            ready: true,
          });
        } else {
          ticked += tick;
          if (timeout && ticked >= timeout) {
            resolve({
              interval,
              ready: false,
            });
          }
        }
      }, tick) as unknown) as number;
    });
  }

  /** Returns the current backend. */
  protected _getBackend(): B {
    return this._backend;
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
    const { normalizeDepth = 3 } = this.getOptions();
    const prepared: Event = {
      ...event,
      event_id: event.event_id || (hint && hint.event_id ? hint.event_id : uuid4()),
      timestamp: event.timestamp || timestampWithMs(),
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
    let result = SyncPromise.resolve<Event | null>(prepared);

    // This should be the last thing called, since we want that
    // {@link Hub.addEventProcessor} gets the finished prepared event.
    if (finalScope) {
      // In case we have a hub we reassign it.
      result = finalScope.applyToEvent(prepared, hint);
    }

    return result.then(evt => {
      // tslint:disable-next-line:strict-type-predicates
      if (typeof normalizeDepth === 'number' && normalizeDepth > 0) {
        return this._normalizeEvent(evt, normalizeDepth);
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
  protected _normalizeEvent(event: Event | null, depth: number): Event | null {
    if (!event) {
      return null;
    }

    // tslint:disable:no-unsafe-any
    return {
      ...event,
      ...(event.breadcrumbs && {
        breadcrumbs: event.breadcrumbs.map(b => ({
          ...b,
          ...(b.data && {
            data: normalize(b.data, depth),
          }),
        })),
      }),
      ...(event.user && {
        user: normalize(event.user, depth),
      }),
      ...(event.contexts && {
        contexts: normalize(event.contexts, depth),
      }),
      ...(event.extra && {
        extra: normalize(event.extra, depth),
      }),
    };
  }

  /**
   *  Enhances event using the client configuration.
   *  It takes care of all "static" values like environment, release and `dist`,
   *  as well as truncating overly long values.
   * @param event event instance to be enhanced
   */
  protected _applyClientOptions(event: Event): void {
    const { environment, release, dist, maxValueLength = 250 } = this.getOptions();

    if (event.environment === undefined && environment !== undefined) {
      event.environment = environment;
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
   * @param sdkInfo The sdkInfo of the event that will be filled with all integrations.
   */
  protected _applyIntegrationsMetadata(event: Event): void {
    const sdkInfo = event.sdk;
    const integrationsArray = Object.keys(this._integrations);
    if (sdkInfo && integrationsArray.length > 0) {
      sdkInfo.integrations = integrationsArray;
    }
  }

  /**
   * Tells the backend to send this event
   * @param event The Sentry event to send
   */
  protected _sendEvent(event: Event): void {
    this._getBackend().sendEvent(event);
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
    const { beforeSend, sampleRate } = this.getOptions();

    if (!this._isEnabled()) {
      return SyncPromise.reject('SDK not enabled, will not send event.');
    }

    const isTransaction = event.type === 'transaction';
    // 1.0 === 100% events are sent
    // 0.0 === 0% events are sent
    // Sampling for transaction happens somewhere else
    if (!isTransaction && typeof sampleRate === 'number' && Math.random() > sampleRate) {
      return SyncPromise.reject('This event has been sampled, will not send event.');
    }

    return new SyncPromise((resolve, reject) => {
      this._prepareEvent(event, scope, hint)
        .then(prepared => {
          if (prepared === null) {
            reject('An event processor returned null, will not send event.');
            return;
          }

          let finalEvent: Event | null = prepared;

          const isInternalException = hint && hint.data && (hint.data as { [key: string]: any }).__sentry__ === true;
          // We skip beforeSend in case of transactions
          if (isInternalException || !beforeSend || isTransaction) {
            this._sendEvent(finalEvent);
            resolve(finalEvent);
            return;
          }

          const beforeSendResult = beforeSend(prepared, hint);
          // tslint:disable-next-line:strict-type-predicates
          if (typeof beforeSendResult === 'undefined') {
            logger.error('`beforeSend` method has to return `null` or a valid event.');
          } else if (isThenable(beforeSendResult)) {
            this._handleAsyncBeforeSend(beforeSendResult as PromiseLike<Event | null>, resolve, reject);
          } else {
            finalEvent = beforeSendResult as Event | null;

            if (finalEvent === null) {
              logger.log('`beforeSend` returned `null`, will not send event.');
              resolve(null);
              return;
            }

            // From here on we are really async
            this._sendEvent(finalEvent);
            resolve(finalEvent);
          }
        })
        .then(null, reason => {
          this.captureException(reason, {
            data: {
              __sentry__: true,
            },
            originalException: reason as Error,
          });
          reject(
            `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.\nReason: ${reason}`,
          );
        });
    });
  }

  /**
   * Resolves before send Promise and calls resolve/reject on parent SyncPromise.
   */
  private _handleAsyncBeforeSend(
    beforeSend: PromiseLike<Event | null>,
    resolve: (event: Event) => void,
    reject: (reason: string) => void,
  ): void {
    beforeSend
      .then(processedEvent => {
        if (processedEvent === null) {
          reject('`beforeSend` returned `null`, will not send event.');
          return;
        }
        // From here on we are really async
        this._sendEvent(processedEvent);
        resolve(processedEvent);
      })
      .then(null, e => {
        reject(`beforeSend rejected with ${e}`);
      });
  }
}
