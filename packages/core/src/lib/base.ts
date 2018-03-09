import { Breadcrumb, Context, SentryEvent } from './domain';
import { DSN } from './dsn';
import { Backend, Frontend, Options } from './interfaces';
import { SendStatus } from './status';

/**
 * Default maximum number of breadcrumbs added to an event.
 * Can be overwritten with {@link Options.maxBreadcrumbs}.
 */
const MAX_BREADCRUMBS = 100;

/** A class object that can instanciate Backend objects. */
export interface BackendClass<B extends Backend, O extends Options> {
  new (frontend: Frontend<O>): B;
}

/**
 * Basic implementation for all JavaScript SDKs.
 *
 * Call the constructor with the corresponding backend constructor and
 * options specific to the frontend subclass. To access these options later,
 * use {@link Frontend.getOptions}. Also, the Backend instance is available
 * via {@link Frontend.getBackend}.
 *
 * There are two abstract methods that need to be implemented:
 * {@link Frontend.captureException} and {@link Frontend.captureMessage}.
 * They must call {@link Frontend.sendEvent} internally after preparing a valid
 * {@link SentryEvent} instance. To automatically issue events, also use that
 * method. It will internally add meta data from context, breadcrumbs and
 * options.
 *
 * The implementation of {@link sendEvent} prepares the event by adding context
 * and breadcrumbs. However, platform specific meta data (such as the User's IP)
 * address must be added by the SDK implementor.
 *
 * To issue auto-breadcrumbs, use {@link Frontend.addBreadcrumb}. They will be
 * added automatically when sending events.
 *
 * If a DSN is specified in the options, it will be parsed and stored. Use
 * {@link Frontend.getDSN} to retrieve the DSN at any moment. In case the DSN
 * is invalid, the constructor will throw a {@link SentryException}.
 *
 * @example
 * class NodeFrontend extends FrontendBase<NodeBackend, NodeOptions> {
 *   public constructor(options: NodeOptions) {
 *     super(NodeBackend, options);
 *   }
 *
 *   // ...
 * }
 */
export abstract class FrontendBase<B extends Backend, O extends Options>
  implements Frontend<O> {
  /**
   * The backend used to physically interact in the enviornment.
   * Usually, this will correspond to the frontend. When composing SDKs,
   * however, the Backend from the root SDK will be used.
   */
  private readonly backend: B;

  /** Options passed to the SDK. */
  private readonly options: O;

  /**
   * The client DSN, if specified in options. Without this DSN, the SDK will be
   * disabled.
   */
  private dsn?: DSN;

  /** A promise that resolves during installation. */
  private installation?: Promise<boolean>;

  /** Lazy cache of breadcrumbs, initialized when first accessed. */
  private breadcrumbs?: Breadcrumb[];

  /** Lazy cache of context data, initialized when first accessed. */
  private context?: Context;

  /**
   * Initializes this frontend instance.
   *
   * @param backendClass A constructor function to create the backend.
   * @param options Options for the frontend.
   */
  protected constructor(backendClass: BackendClass<B, O>, options: O) {
    this.backend = new backendClass(this);
    this.options = options;

    if (options.dsn) {
      this.dsn = new DSN(options.dsn);
    }
  }

  /**
   * @inheritDoc
   */
  public async install(): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    if (this.installation) {
      return this.installation;
    }

    this.installation = this.getBackend().install();
    return this.installation;
  }

  /**
   * @inheritDoc
   */
  public abstract captureException(exception: any): Promise<void>;

  /**
   * @inheritDoc
   */
  public abstract captureMessage(message: string): Promise<void>;

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent): Promise<void> {
    await this.sendEvent(event);
  }

  /**
   * @inheritDoc
   */
  public async addBreadcrumb(breadcrumb: Breadcrumb): Promise<void> {
    const {
      shouldAddBreadcrumb,
      beforeBreadcrumb,
      afterBreadcrumb,
      maxBreadcrumbs = MAX_BREADCRUMBS,
    } = this.getOptions();

    if (maxBreadcrumbs === 0) {
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

    const breadcrumbs = await this.getBreadcrumbs();
    this.breadcrumbs = [...breadcrumbs, finalBreadcrumb].slice(-maxBreadcrumbs);
    await this.getBackend().storeBreadcrumbs(this.breadcrumbs);

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
  public async setOptions(nextOptions: O): Promise<void> {
    if (
      nextOptions.dsn &&
      String(this.options.dsn) !== String(nextOptions.dsn)
    ) {
      this.dsn = new DSN(nextOptions.dsn);
    }

    Object.assign(this.options, nextOptions);
    // TODO: Update options in the backend..?
  }

  /**
   * @inheritDoc
   */
  public async getContext(): Promise<Context> {
    if (!this.context) {
      this.context = { ...(await this.getBackend().loadContext()) };
    }

    return this.context;
  }

  /**
   * @inheritDoc
   */
  public async setContext(nextContext: Context): Promise<void> {
    const context = await this.getContext();

    if (nextContext.extra) {
      context.extra = { ...context.extra, ...nextContext.extra };
    }
    if (nextContext.tags) {
      context.tags = { ...context.tags, ...nextContext.tags };
    }
    if (nextContext.user) {
      context.user = { ...context.user, ...nextContext.user };
    }

    await this.getBackend().storeContext(context);
  }

  /** Returns the current backend. */
  protected getBackend(): B {
    return this.backend;
  }

  /** Resolves all currently known breadcrumbs. */
  protected async getBreadcrumbs(): Promise<Breadcrumb[]> {
    if (!this.breadcrumbs) {
      this.breadcrumbs = [...(await this.getBackend().loadBreadcrumbs())];
    }

    return this.breadcrumbs;
  }

  /**
   * Sends an event (either error or message) to Sentry.
   *
   * This also adds breadcrumbs and context information to the event. However,
   * platform specific meta data (such as the User's IP address) must be added
   * by the SDK implementor.
   *
   * The returned event status offers clues to whether the event was sent to
   * Sentry and accepted there. If the {@link Options.shouldSend} hook returns
   * `false`, the status will be {@link SendStatus.Skipped}.If the rate limit
   * was exceeded, the status will be {@link SendStatus.RateLimit}.
   *
   * @param event The event to send to Sentry.
   * @returns A Promise that resolves with the event status.
   */
  protected async sendEvent(event: SentryEvent): Promise<SendStatus> {
    if (!this.isEnabled()) {
      return SendStatus.Skipped;
    }

    const prepared = await this.prepareEvent(event);
    const { shouldSend, beforeSend, afterSend } = this.getOptions();
    if (shouldSend && !shouldSend(prepared)) {
      return SendStatus.Skipped;
    }

    const finalEvent = beforeSend ? beforeSend(prepared) : prepared;
    const code = await this.getBackend().sendEvent(finalEvent);
    const status = SendStatus.fromHttpCode(code);

    // TODO: Handle rate limits and maintain a queue. For now, we require SDK
    // implementors to override this method and handle it themselves.

    if (afterSend) {
      afterSend(finalEvent, status);
    }

    return status;
  }

  /** Determines whether this SDK is enabled and a valid DSN is present. */
  protected isEnabled(): boolean {
    return this.getOptions().enabled !== false && this.dsn !== undefined;
  }

  /**
   * Adds common information to events, such as breadcrumbs, context, release
   * and environment information.
   *
   * @param event The original event.
   * @returns A new event with more information.
   */
  private async prepareEvent(event: SentryEvent): Promise<SentryEvent> {
    const {
      environment,
      maxBreadcrumbs = MAX_BREADCRUMBS,
      release,
    } = this.getOptions();

    const prepared = { ...event };
    if (environment !== undefined) {
      prepared.environment = environment;
    }
    if (release !== undefined) {
      prepared.release = release;
    }

    const breadcrumbs = await this.getBreadcrumbs();
    if (breadcrumbs.length > 0 && maxBreadcrumbs > 0) {
      prepared.breadcrumbs = breadcrumbs.slice(-maxBreadcrumbs);
    }

    const context = await this.getContext();
    if (context.extra) {
      prepared.extra = { ...context.extra, ...event.extra };
    }
    if (context.tags) {
      prepared.tags = { ...context.tags, ...event.tags };
    }
    if (context.user) {
      prepared.user = { ...context.user, ...event.user };
    }

    return prepared;
  }
}
