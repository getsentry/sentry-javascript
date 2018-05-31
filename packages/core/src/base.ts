import { Breadcrumb, SdkInfo, SentryEvent } from '@sentry/types';
import { DSN } from './dsn';
import { Backend, Client, Options } from './interfaces';
import { Scope } from './scope';
import { SendStatus } from './status';

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
 * Subclasses must implement one abstract method: {@link getSdkInfo}. It must
 * return the unique name and the version of the SDK.
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
export abstract class BaseClient<B extends Backend, O extends Options>
  implements Client<O> {
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
      return false;
    }

    if (this.installed === undefined) {
      this.installed = this.getBackend().install();
    }

    return this.installed;
  }

  /**
   * @inheritDoc
   */
  public async captureException(exception: any, scope: Scope): Promise<void> {
    const event = await this.getBackend().eventFromException(exception);
    await this.captureEvent(event, scope);
  }

  /**
   * @inheritDoc
   */
  public async captureMessage(message: string, scope: Scope): Promise<void> {
    const event = await this.getBackend().eventFromMessage(message);
    await this.captureEvent(event, scope);
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent, scope: Scope): Promise<void> {
    await this.processEvent(event, scope, async finalEvent =>
      this.getBackend().sendEvent(finalEvent),
    );
  }

  /**
   * @inheritDoc
   */
  public async addBreadcrumb(
    breadcrumb: Breadcrumb,
    scope: Scope,
  ): Promise<void> {
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

    const finalBreadcrumb = beforeBreadcrumb
      ? beforeBreadcrumb(mergedBreadcrumb)
      : mergedBreadcrumb;

    if (await this.getBackend().storeBreadcrumb(finalBreadcrumb)) {
      scope.addBreadcrumb(
        finalBreadcrumb,
        Math.min(maxBreadcrumbs, MAX_BREADCRUMBS),
      );
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

  /**
   * @inheritDoc
   */
  public createScope(parentScope?: Scope): Scope {
    const newScope = new Scope();
    newScope.setParentScope(parentScope);
    newScope.setOnChange((scope: Scope) => {
      this.getBackend().storeScope(scope);
    });
    return newScope;
  }

  /** Returns the current used SDK version and name. */
  protected abstract getSdkInfo(): SdkInfo;

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
   * The information includes release and environment from `options`, SDK
   * information returned by {@link BaseClient.getSdkInfo}, as well as
   * breadcrumbs and context (extra, tags and user) from the scope.
   *
   * Information that is already present in the event is never overwritten. For
   * nested objects, such as the context, keys are merged.
   *
   * @param event The original event.
   * @param scope A scope containing event metadata.
   * @returns A new event with more information.
   */
  protected async prepareEvent(
    event: SentryEvent,
    scope: Scope,
  ): Promise<SentryEvent> {
    const {
      environment,
      maxBreadcrumbs = DEFAULT_BREADCRUMBS,
      release,
    } = this.getOptions();

    const prepared = { sdk: this.getSdkInfo(), ...event };
    if (prepared.environment === undefined && environment !== undefined) {
      prepared.environment = environment;
    }
    if (prepared.release === undefined && release !== undefined) {
      prepared.release = release;
    }

    scope.applyToEvent(prepared, Math.min(maxBreadcrumbs, MAX_BREADCRUMBS));

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
   * @param scope A scope containing event metadata.
   * @param send A function to actually send the event.
   * @returns A Promise that resolves with the event status.
   */
  protected async processEvent(
    event: SentryEvent,
    scope: Scope,
    send: (finalEvent: SentryEvent) => Promise<number>,
  ): Promise<SendStatus> {
    if (!this.isEnabled()) {
      return SendStatus.Skipped;
    }

    const prepared = await this.prepareEvent(event, scope);
    const { shouldSend, beforeSend, afterSend } = this.getOptions();
    if (shouldSend && !shouldSend(prepared)) {
      return SendStatus.Skipped;
    }

    const finalEvent = beforeSend ? beforeSend(prepared) : prepared;
    const code = await send(finalEvent);
    const status = SendStatus.fromHttpCode(code);

    if (status === SendStatus.RateLimit) {
      // TODO: Handle rate limits and maintain a queue. For now, we require SDK
      // implementors to override this method and handle it themselves.
    }

    if (afterSend) {
      afterSend(finalEvent, status);
    }

    return status;
  }
}
