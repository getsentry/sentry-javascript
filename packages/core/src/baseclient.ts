import { Scope } from '@sentry/hub';
import { Client, Event, EventHint, Integration, IntegrationClass, Options, SdkInfo, Severity } from '@sentry/types';
import { Dsn, isPrimitive, isThenable, logger, normalize, SyncPromise, truncate, uuid4 } from '@sentry/utils';

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
   * The backend used to physically interact in the enviornment. Usually, this
   * will correspond to the client. When composing SDKs, however, the Backend
   * from the root SDK will be used.
   */
  protected readonly _backend: B;

  /** Options passed to the SDK. */
  protected readonly _options: O;

  /** The client Dsn, if specified in options. Without this Dsn, the SDK will be disabled. */
  protected readonly _dsn?: Dsn;

  /** Array of used integrations. */
  protected readonly _integrations: IntegrationIndex = {};

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

    if (this._isEnabled()) {
      this._integrations = setupIntegrations(this._options);
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
      .then(event => this._processEvent(event, hint, scope))
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
  public captureMessage(message: string, level?: Severity, hint?: EventHint, scope?: Scope): string | undefined {
    let eventId: string | undefined = hint && hint.event_id;

    this._processing = true;

    const promisedEvent = isPrimitive(message)
      ? this._getBackend().eventFromMessage(`${message}`, level, hint)
      : this._getBackend().eventFromException(message, hint);

    promisedEvent
      .then(event => this._processEvent(event, hint, scope))
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
   * @inheritDoc
   */
  public getIntegrations(): IntegrationIndex {
    return this._integrations || {};
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
   * @param hint May contain additional informartion about the original exception.
   * @param scope A scope containing event metadata.
   * @returns A new event with more information.
   */
  protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): PromiseLike<Event | null> {
    const { environment, release, dist, maxValueLength = 250, normalizeDepth = 3 } = this.getOptions();

    const prepared: Event = { ...event };
    if (prepared.environment === undefined && environment !== undefined) {
      prepared.environment = environment;
    }
    if (prepared.release === undefined && release !== undefined) {
      prepared.release = release;
    }

    if (prepared.dist === undefined && dist !== undefined) {
      prepared.dist = dist;
    }

    if (prepared.message) {
      prepared.message = truncate(prepared.message, maxValueLength);
    }

    const exception = prepared.exception && prepared.exception.values && prepared.exception.values[0];
    if (exception && exception.value) {
      exception.value = truncate(exception.value, maxValueLength);
    }

    const request = prepared.request;
    if (request && request.url) {
      request.url = truncate(request.url, maxValueLength);
    }

    if (prepared.event_id === undefined) {
      prepared.event_id = hint && hint.event_id ? hint.event_id : uuid4();
    }

    this._addIntegrations(prepared.sdk);

    // We prepare the result here with a resolved Event.
    let result = SyncPromise.resolve<Event | null>(prepared);

    // This should be the last thing called, since we want that
    // {@link Hub.addEventProcessor} gets the finished prepared event.
    if (scope) {
      // In case we have a hub we reassign it.
      result = scope.applyToEvent(prepared, hint);
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
   * This function adds all used integrations to the SDK info in the event.
   * @param sdkInfo The sdkInfo of the event that will be filled with all integrations.
   */
  protected _addIntegrations(sdkInfo?: SdkInfo): void {
    const integrationsArray = Object.keys(this._integrations);
    if (sdkInfo && integrationsArray.length > 0) {
      sdkInfo.integrations = integrationsArray;
    }
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
   * @param hint May contain additional informartion about the original exception.
   * @param scope A scope containing event metadata.
   * @returns A SyncPromise that resolves with the event or rejects in case event was/will not be send.
   */
  protected _processEvent(event: Event, hint?: EventHint, scope?: Scope): PromiseLike<Event> {
    const { beforeSend, sampleRate } = this.getOptions();

    if (!this._isEnabled()) {
      return SyncPromise.reject('SDK not enabled, will not send event.');
    }

    // 1.0 === 100% events are sent
    // 0.0 === 0% events are sent
    if (typeof sampleRate === 'number' && Math.random() > sampleRate) {
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

          try {
            const isInternalException = hint && hint.data && (hint.data as { [key: string]: any }).__sentry__ === true;
            if (isInternalException || !beforeSend) {
              this._getBackend().sendEvent(finalEvent);
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
              this._getBackend().sendEvent(finalEvent);
              resolve(finalEvent);
            }
          } catch (exception) {
            this.captureException(exception, {
              data: {
                __sentry__: true,
              },
              originalException: exception as Error,
            });
            reject('`beforeSend` threw an error, will not send event.');
          }
        })
        .then(null, () => {
          reject('`beforeSend` threw an error, will not send event.');
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
        this._getBackend().sendEvent(processedEvent);
        resolve(processedEvent);
      })
      .then(null, e => {
        reject(`beforeSend rejected with ${e}`);
      });
  }
}
