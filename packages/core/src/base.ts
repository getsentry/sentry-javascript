import { Scope } from '@sentry/hub';
import { Breadcrumb, SentryEvent, SentryResponse, Status } from '@sentry/types';
import { uuid4 } from '@sentry/utils/misc';
import { truncate } from '@sentry/utils/string';
import { DSN } from './dsn';
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

/** A class object that can instanciate Backend objects. */
export interface BackendClass<B extends Backend, O extends Options> {
  new (options: O): B;
}

/**
 * Base implementation for all JavaScript SDK clients.
 *
 * Call the constructor with the corresponding backend constructor and options
 * specific to the client subclass. To access these options later, use
 * {@link Client.getOptions}. Also, the Backend instance is available via
 * {@link Client.getBackend}.
 *
 * If a DSN is specified in the options, it will be parsed and stored. Use
 * {@link Client.getDSN} to retrieve the DSN at any moment. In case the DSN is
 * invalid, the constructor will throw a {@link SentryException}. Note that
 * without a valid DSN, the SDK will not send any events to Sentry.
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
   * The client DSN, if specified in options. Without this DSN, the SDK will be
   * disabled.
   */
  private readonly dsn?: DSN;

  /**
   * Stores whether installation has been performed and was successful. Before
   * installing, this is undefined. Then it contains the success state.
   */
  private installed?: boolean;

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
      this.dsn = new DSN(options.dsn);
    }
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
  public async captureException(exception: any, syntheticException: Error | null, scope?: Scope): Promise<void> {
    const event = await this.getBackend().eventFromException(exception, syntheticException);
    await this.captureEvent(event, scope);
  }

  /**
   * @inheritDoc
   */
  public async captureMessage(message: string, syntheticException: Error | null, scope?: Scope): Promise<void> {
    const event = await this.getBackend().eventFromMessage(message, syntheticException);
    await this.captureEvent(event, scope);
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent, scope?: Scope): Promise<SentryResponse> {
    // TODO: Notify developers that it's impossible to call `captureX` methods
    // without calling `init` in the first place
    return this.processEvent(event, async finalEvent => this.getBackend().sendEvent(finalEvent), scope);
  }

  /**
   * @inheritDoc
   */
  public async addBreadcrumb(breadcrumb: Breadcrumb, scope?: Scope): Promise<void> {
    const {
      shouldAddBreadcrumb,
      beforeBreadcrumb,
      afterBreadcrumb,
      maxBreadcrumbs = DEFAULT_BREADCRUMBS,
    } = this.getOptions();

    if (maxBreadcrumbs <= 0) {
      return;
    }

    const timestamp = new Date().getTime() / 1000;
    const mergedBreadcrumb = { timestamp, ...breadcrumb };
    if (shouldAddBreadcrumb && !shouldAddBreadcrumb(mergedBreadcrumb)) {
      return;
    }

    const finalBreadcrumb = beforeBreadcrumb ? beforeBreadcrumb(mergedBreadcrumb) : mergedBreadcrumb;

    if ((await this.getBackend().storeBreadcrumb(finalBreadcrumb)) && scope) {
      scope.addBreadcrumb(finalBreadcrumb, Math.min(maxBreadcrumbs, MAX_BREADCRUMBS));
    }

    if (afterBreadcrumb) {
      afterBreadcrumb(finalBreadcrumb);
    }
  }

  /**
   * @inheritDoc
   */
  public getDSN(): DSN | undefined {
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

  /** Determines whether this SDK is enabled and a valid DSN is present. */
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
   * @param scope A scope containing event metadata.
   * @returns A new event with more information.
   */
  protected async prepareEvent(event: SentryEvent, scope?: Scope): Promise<SentryEvent | null> {
    const { environment, maxBreadcrumbs = DEFAULT_BREADCRUMBS, release } = this.getOptions();

    const prepared = { ...event };
    if (prepared.environment === undefined && environment !== undefined) {
      prepared.environment = environment;
    }
    if (prepared.release === undefined && release !== undefined) {
      prepared.release = release;
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

    prepared.event_id = uuid4();

    // This should be the last thing called, since we want that
    // {@link Hub.addEventProcessor} gets the finished prepared event.
    if (scope) {
      return scope.applyToEvent(prepared, Math.min(maxBreadcrumbs, MAX_BREADCRUMBS));
    }

    return prepared;
  }

  /**
   * Processes an event (either error or message) and sends it to Sentry.
   *
   * This also adds breadcrumbs and context information to the event. However,
   * platform specific meta data (such as the User's IP address) must be added
   * by the SDK implementor.
   *
   * The returned event status offers clues to whether the event was sent to
   * Sentry and accepted there. If the {@link Options.shouldSend} hook returns
   * `false`, the status will be {@link SendStatus.Skipped}. If the rate limit
   * was exceeded, the status will be {@link SendStatus.RateLimit}.
   *
   * @param event The event to send to Sentry.
   * @param send A function to actually send the event.
   * @param scope A scope containing event metadata.
   * @returns A Promise that resolves with the event status.
   */
  protected async processEvent(
    event: SentryEvent,
    send: (finalEvent: SentryEvent) => Promise<SentryResponse>,
    scope?: Scope,
  ): Promise<SentryResponse> {
    if (!this.isEnabled()) {
      return {
        status: Status.Skipped,
      };
    }

    const prepared = await this.prepareEvent(event, scope);
    const { shouldSend, beforeSend, afterSend } = this.getOptions();
    if (prepared === null || (shouldSend && !shouldSend(prepared))) {
      return {
        status: Status.Skipped,
      };
    }

    // TODO: Add breadcrumb with our own event?
    // Or should it be handled by the xhr/fetch integration itself?
    // Or maybe some other integration that'd use `afterSend`?

    const finalEvent = beforeSend ? beforeSend(prepared) : prepared;
    const response = await send(finalEvent);

    if (response.status === Status.RateLimit) {
      // TODO: Handle rate limits and maintain a queue. For now, we require SDK
      // implementors to override this method and handle it themselves.
    }

    // TODO: Handle duplicates and backoffs
    if (afterSend) {
      afterSend(finalEvent, response);
    }

    return response;
  }
}
