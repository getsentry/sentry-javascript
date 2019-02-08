import { Scope } from '@sentry/hub';
import {
  Breadcrumb,
  Integration,
  IntegrationClass,
  SentryBreadcrumbHint,
  SentryEvent,
  SentryEventHint,
  Severity,
} from '@sentry/types';
import { isPrimitive, isThenable } from '@sentry/utils/is';
import { logger } from '@sentry/utils/logger';
import { consoleSandbox, uuid4 } from '@sentry/utils/misc';
import { truncate } from '@sentry/utils/string';
import { SyncPromise } from '@sentry/utils/syncpromise';
import { BackendClass } from './basebackend';
import { Dsn } from './dsn';
import { IntegrationIndex, setupIntegrations } from './integration';
import { Backend, Client, Options } from './interfaces';

/**
 * Default maximum number of breadcrumbs added to an event. Can be overwritten
 * with {@link Options.maxBreadcrumbs}.
 */
const DEFAULT_BREADCRUMBS = 30;

/**
 * Absolute maximum number of breadcrumbs added to an event. The
 * `maxBreadcrumbs` option cannot be higher than this value.
 */
const MAX_BREADCRUMBS = 100;

/**
 * By default, truncates URL values to 250 chars
 */
const MAX_URL_LENGTH = 250;

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
  private readonly backend: B;

  /** Options passed to the SDK. */
  private readonly options: O;

  /**
   * The client Dsn, if specified in options. Without this Dsn, the SDK will be
   * disabled.
   */
  private readonly dsn?: Dsn;

  /**
   * Stores whether installation has been performed and was successful. Before
   * installing, this is undefined. Then it contains the success state.
   */
  private installed?: boolean;

  /** Array of used integrations. */
  private readonly integrations: IntegrationIndex;

  /**
   * Initializes this client instance.
   *
   * @param backendClass A constructor function to create the backend.
   * @param options Options for the client.
   */
  protected constructor(backendClass: BackendClass<B, O>, options: O) {
    this.backend = new backendClass(options);
    this.options = options;

    if (options.dsn) {
      this.dsn = new Dsn(options.dsn);
    }
    // We have to setup the integrations in the constructor since we do not want
    // that anyone needs to call client.install();
    this.integrations = setupIntegrations(this.options);
  }

  /**
   * @inheritDoc
   */
  public install(): boolean {
    if (!this.isEnabled()) {
      return (this.installed = false);
    }

    const backend = this.getBackend();
    if (!this.installed && backend.install) {
      backend.install();
    }

    return (this.installed = true);
  }

  /**
   * @inheritDoc
   */
  public captureException(exception: any, hint?: SentryEventHint, scope?: Scope): string | undefined {
    let eventId: string | undefined = hint && hint.event_id;

    this.getBackend()
      .eventFromException(exception, hint)
      .then(event => this.processEvent(event, hint, scope))
      .then(finalEvent => {
        eventId = finalEvent.event_id;
      })
      .catch(reason => {
        logger.log(reason);
      });

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureMessage(message: string, level?: Severity, hint?: SentryEventHint, scope?: Scope): string | undefined {
    let eventId: string | undefined = hint && hint.event_id;

    const promisedEvent = isPrimitive(message)
      ? this.getBackend().eventFromMessage(`${message}`, level, hint)
      : this.getBackend().eventFromException(message, hint);

    promisedEvent
      .then(event => this.processEvent(event, hint, scope))
      .then(finalEvent => {
        eventId = finalEvent.event_id;
      })
      .catch(reason => {
        logger.log(reason);
      });

    return eventId;
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: SentryEvent, hint?: SentryEventHint, scope?: Scope): string | undefined {
    let eventId: string | undefined = hint && hint.event_id;
    this.processEvent(event, hint, scope)
      .then(finalEvent => {
        eventId = finalEvent.event_id;
      })
      .catch(reason => {
        logger.log(reason);
      });
    return eventId;
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, hint?: SentryBreadcrumbHint, scope?: Scope): void {
    const { beforeBreadcrumb, maxBreadcrumbs = DEFAULT_BREADCRUMBS } = this.getOptions();

    if (maxBreadcrumbs <= 0) {
      return;
    }

    const timestamp = new Date().getTime() / 1000;
    const mergedBreadcrumb = { timestamp, ...breadcrumb };
    const finalBreadcrumb = beforeBreadcrumb
      ? (consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) as Breadcrumb | null)
      : mergedBreadcrumb;

    if (finalBreadcrumb === null) {
      return;
    }

    if (this.getBackend().storeBreadcrumb(finalBreadcrumb) && scope) {
      scope.addBreadcrumb(finalBreadcrumb, Math.min(maxBreadcrumbs, MAX_BREADCRUMBS));
    }
  }

  /**
   * @inheritDoc
   */
  public getDsn(): Dsn | undefined {
    return this.dsn;
  }

  /**
   * @inheritDoc
   */
  public getOptions(): O {
    return this.options;
  }

  /** Returns the current backend. */
  protected getBackend(): B {
    return this.backend;
  }

  /** Determines whether this SDK is enabled and a valid Dsn is present. */
  protected isEnabled(): boolean {
    return this.getOptions().enabled !== false && this.dsn !== undefined;
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
  protected prepareEvent(event: SentryEvent, scope?: Scope, hint?: SentryEventHint): SyncPromise<SentryEvent | null> {
    const { environment, maxBreadcrumbs = DEFAULT_BREADCRUMBS, release, dist } = this.getOptions();

    const prepared = { ...event };
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
      prepared.message = truncate(prepared.message, MAX_URL_LENGTH);
    }

    const exception = prepared.exception && prepared.exception.values && prepared.exception.values[0];
    if (exception && exception.value) {
      exception.value = truncate(exception.value, MAX_URL_LENGTH);
    }

    const request = prepared.request;
    if (request && request.url) {
      request.url = truncate(request.url, MAX_URL_LENGTH);
    }

    if (prepared.event_id === undefined) {
      prepared.event_id = uuid4();
    }

    // We prepare the result here with a resolved SentryEvent.
    let result = SyncPromise.resolve<SentryEvent | null>(prepared);

    // This should be the last thing called, since we want that
    // {@link Hub.addEventProcessor} gets the finished prepared event.
    if (scope) {
      // In case we have a hub we reassign it.
      result = scope.applyToEvent(prepared, hint, Math.min(maxBreadcrumbs, MAX_BREADCRUMBS));
    }

    return result;
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
  protected processEvent(event: SentryEvent, hint?: SentryEventHint, scope?: Scope): SyncPromise<SentryEvent> {
    const { beforeSend, sampleRate } = this.getOptions();

    if (!this.isEnabled()) {
      return SyncPromise.reject('SDK not enabled, will not send event.');
    }

    // 1.0 === 100% events are sent
    // 0.0 === 0% events are sent
    if (typeof sampleRate === 'number' && Math.random() > sampleRate) {
      return SyncPromise.reject('This event has been sampled, will not send event.');
    }

    return new SyncPromise((resolve, reject) => {
      this.prepareEvent(event, scope, hint).then(prepared => {
        if (prepared === null) {
          reject('An event processor returned null, will not send event.');
          return;
        }

        let finalEvent: SentryEvent | null = prepared;

        try {
          const isInternalException = hint && hint.data && (hint.data as { [key: string]: any }).__sentry__ === true;
          if (isInternalException || !beforeSend) {
            this.getBackend().sendEvent(finalEvent);
            resolve(finalEvent);
            return;
          }

          const beforeSendResult = beforeSend(prepared, hint);
          if ((typeof beforeSendResult as any) === 'undefined') {
            logger.error('`beforeSend` method has to return `null` or a valid event.');
          } else if (isThenable(beforeSendResult)) {
            this.handleAsyncBeforeSend(beforeSendResult as Promise<SentryEvent | null>, resolve, reject);
          } else {
            finalEvent = beforeSendResult as SentryEvent | null;

            if (finalEvent === null) {
              logger.log('`beforeSend` returned `null`, will not send event.');
              resolve(null);
              return;
            }

            // From here on we are really async
            this.getBackend().sendEvent(finalEvent);
            resolve(finalEvent);
          }
        } catch (exception) {
          this.captureException(exception, {
            data: {
              __sentry__: true,
            },
            originalException: exception as Error,
          });
          reject('`beforeSend` throw an error, will not send event.');
        }
      });
    });
  }

  /**
   * Resolves before send Promise and calls resolve/reject on parent SyncPromise.
   */
  private handleAsyncBeforeSend(
    beforeSend: Promise<SentryEvent | null>,
    resolve: (event: SentryEvent) => void,
    reject: (reason: string) => void,
  ): void {
    beforeSend
      .then(processedEvent => {
        if (processedEvent === null) {
          reject('`beforeSend` returned `null`, will not send event.');
          return;
        }
        // From here on we are really async
        this.getBackend().sendEvent(processedEvent);
        resolve(processedEvent);
      })
      .catch(e => {
        reject(`beforeSend rejected with ${e}`);
      });
  }

  /**
   * @inheritDoc
   */
  public async flush(timeout?: number): Promise<boolean> {
    return this.getBackend()
      .getTransport()
      .close(timeout);
  }

  /**
   * @inheritDoc
   */
  public async close(timeout?: number): Promise<boolean> {
    return this.flush(timeout);
  }

  /**
   * @inheritDoc
   */
  public getIntegrations(): IntegrationIndex {
    return this.integrations || {};
  }

  /**
   * @inheritDoc
   */
  public getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
    try {
      return (this.integrations[integration.id] as T) || null;
    } catch (_oO) {
      logger.warn(`Cannot retrieve integration ${integration.id} from the current Client`);
      return null;
    }
  }
}
