import { Breadcrumb, Context, SentryEvent } from './domain';
import { Frontend, Options } from './interfaces';

/** A class object that can instanciate Backend objects. */
export interface FrontendClass<F extends Frontend, O extends Options> {
  new (options: O): F;
}

/** A Sentry SDK class. */
export class Sdk<F extends Frontend<O>, O extends Options> {
  /** The SDK specific frontend class. */
  private readonly frontendClass: FrontendClass<F, O>;
  /** The frontend instance generated in create(). */
  private frontend?: F;

  /** Creates a new SDK. */
  public constructor(frontendClass: FrontendClass<F, O>) {
    this.frontendClass = frontendClass;
  }

  /**
   * Creates and initializes the SDK.
   * @param options Options to customize SDK behavior.
   */
  public async create(options: O): Promise<void> {
    this.frontend = new this.frontendClass(options);
    await this.frontend.install();
  }

  /**
   * Captures an exception evebt and sends it to Sentry.
   *
   * @param exception An exception-like object.
   * @returns A Promise that resolves when the exception has been sent.
   */
  public async captureException(exception: any): Promise<void> {
    await this.withInstance(async f => f.captureException(exception));
  }
  /**
   * Captures a message event and sends it to Sentry.
   *
   * @param message The message to send to Sentry.
   * @returns A Promise that resolves when the message has been sent.
   */
  public async captureMessage(message: string): Promise<void> {
    await this.withInstance(async f => f.captureMessage(message));
  }

  /**
   * Captures a manually created event and sends it to Sentry.
   *
   * @param event The event to send to Sentry.
   * @returns A Promise that resolves when the event has been sent.
   */
  public async captureEvent(event: SentryEvent): Promise<void> {
    await this.withInstance(async f => f.captureEvent(event));
  }

  /**
   * Records a new breadcrumb which will be attached to future events.
   *
   * Breadcrumbs will be added to subsequent events to provide more context on
   * user's actions prior to an error or crash. To configure the maximum number
   * of breadcrumbs, use {@link Options.maxBreadcrumbs}.
   *
   * @param breadcrumb The breadcrumb to record.
   * @returns A Promise that resolves when the breadcrumb has been persisted.
   */
  public async addBreadcrumb(breadcrumb: Breadcrumb): Promise<void> {
    await this.withInstance(async f => f.addBreadcrumb(breadcrumb));
  }

  /**
   * Updates SDK options with the provided values.
   *
   * @param options A partial options object to merge into current options.
   * @returns A Promise that resolves when the new options have been applied.
   */
  public async setOptions(options: O): Promise<void> {
    await this.withInstance(async f => f.setOptions(options));
  }

  /**
   * Updates context information (user, tags, extras) for future events.
   *
   * @param context A partial context object to merge into current context.
   * @returns A Promise that resolves when the new context has been merged.
   */
  public async setContext(context: Context): Promise<void> {
    await this.withInstance(async f => f.setContext(context));
  }

  /**
   * Calls the given callback only if a frontend has been created.
   *
   * @param fn A function that will be executed if a frontend is ready.
   * @returns A Promise that resolves the response or undefined.
   */
  private async withInstance<R>(
    fn: (frontend: F) => R | Promise<R>,
  ): Promise<R | undefined> {
    return this.frontend && fn(this.frontend);
  }
}
