import { Breadcrumb, SentryEvent } from '@sentry/types';
import { Layer } from './interfaces';
import { Scope } from './scope';

/**
 * API compatibility version of this hub.
 *
 * WARNING: This number should only be incresed when the global interface
 * changes a and new methods are introduced.
 */
export const API_VERSION = 2;

/**
 * Internal class used to make sure we always have the latest internal functions
 * working in case we have a version conflict.
 */
export class Hub {
  /** Is a {@link Layer}[] containing the client and scope */
  private readonly stack: Layer[] = [];

  /**
   * Creates a new instance of the hub, will push one {@link Layer} into the
   * internal stack on creation.
   *
   * @param client bound to the hub.
   * @param scope bound to the hub.
   * @param version number, higher number means higher priority.
   */
  public constructor(client?: any, scope: Scope = new Scope(), private readonly version: number = API_VERSION) {
    this.stack.push({ client, scope });
  }

  /**
   * Internal helper function to call a method on the top client if it exists.
   *
   * @param method The method to call on the client/client.
   * @param args Arguments to pass to the client/frontend.
   */
  private invokeClient(method: string, ...args: any[]): void {
    const top = this.getStackTop();
    if (top && top.client && top.client[method]) {
      top.client[method](...args, top.scope);
    }
  }

  /**
   * Internal helper function to call an async method on the top client if it
   * exists.
   *
   * @param method The method to call on the client/client.
   * @param args Arguments to pass to the client/frontend.
   */
  private invokeClientAsync(method: string, ...args: any[]): void {
    const top = this.getStackTop();
    if (top && top.client && top.client[method]) {
      top.client[method](...args, top.scope).catch((err: any) => {
        console.error(err);
      });
    }
  }

  /**
   * Checks if this hub's version is older than the given version.
   *
   * @param version A version number to compare to.
   * @return True if the given version is newer; otherwise false.
   */
  public isOlderThan(version: number): boolean {
    return this.version < version;
  }

  /**
   * This binds the given client to the current scope.
   * @param client An SDK client (client) instance.
   */
  public bindClient(client?: any): void {
    const top = this.getStackTop();
    top.client = client;
    if (top && top.scope && client) {
      top.scope.addScopeListener((s: Scope) => {
        if (client.getBackend) {
          try {
            client.getBackend().storeScope(s);
          } catch {
            // Do nothing
          }
        }
      });
    }
  }

  /**
   * Create a new scope to store context information.
   *
   * The scope will be layered on top of the current one. It is isolated, i.e. all
   * breadcrumbs and context information added to this scope will be removed once
   * the scope ends. Be sure to always remove this scope with {@link this.popScope}
   * when the operation finishes or throws.
   */
  public pushScope(): void {
    // We want to clone the content of prev scope
    const stack = this.getStack();
    const parentScope = stack.length > 0 ? stack[stack.length - 1].scope : undefined;
    this.getStack().push({
      client: this.getClient(),
      scope: Scope.clone(parentScope),
    });
  }

  /**
   * Removes a previously pushed scope from the stack.
   *
   * This restores the state before the scope was pushed. All breadcrumbs and
   * context information added since the last call to {@link this.pushScope} are
   * discarded.
   */
  public popScope(): boolean {
    return this.getStack().pop() !== undefined;
  }

  /**
   * Creates a new scope with and executes the given operation within.
   * The scope is automatically removed once the operation
   * finishes or throws.
   *
   * This is essentially a convenience function for:
   *
   *     pushScope();
   *     callback();
   *     popScope();
   *
   * @param callback that will be enclosed into push/popScope.
   */
  public withScope(callback: (() => void)): void {
    this.pushScope();
    try {
      callback();
    } finally {
      this.popScope();
    }
  }

  /** Returns the client of the top stack. */
  public getClient(): any | undefined {
    return this.getStackTop().client;
  }

  /** Returns the scope of the top stack. */
  public getScope(): Scope | undefined {
    return this.getStackTop().scope;
  }

  /** Returns the scope stack for domains or the process. */
  public getStack(): Layer[] {
    return this.stack;
  }

  /** Returns the topmost scope layer in the order domain > local > process. */
  public getStackTop(): Layer {
    return this.stack[this.stack.length - 1];
  }

  /**
   * Captures an exception event and sends it to Sentry.
   *
   * @param exception An exception-like object.
   * @param syntheticException Manually thrown exception at the very top, to get _any_ valuable stack trace
   */
  public captureException(exception: any, syntheticException: Error | null = null): void {
    this.invokeClientAsync('captureException', exception, syntheticException);
  }

  /**
   * Captures a message event and sends it to Sentry.
   *
   * @param message The message to send to Sentry.
   * @param syntheticException Manually thrown exception at the very top, to get _any_ valuable stack trace
   */
  public captureMessage(message: string, syntheticException: Error | null = null): void {
    this.invokeClientAsync('captureMessage', message, syntheticException);
  }

  /**
   * Captures a manually created event and sends it to Sentry.
   *
   * @param event The event to send to Sentry.
   */
  public captureEvent(event: SentryEvent): void {
    this.invokeClientAsync('captureEvent', event);
  }

  /**
   * Records a new breadcrumb which will be attached to future events.
   *
   * Breadcrumbs will be added to subsequent events to provide more context on
   * user's actions prior to an error or crash.
   *
   * @param breadcrumb The breadcrumb to record.
   */
  public addBreadcrumb(breadcrumb: Breadcrumb): void {
    this.invokeClient('addBreadcrumb', breadcrumb);
  }

  /**
   * Callback to set context information onto the scope.
   *
   * @param callback Callback function that receives Scope.
   */
  public configureScope(callback: (scope: Scope) => void): void {
    const top = this.getStackTop();
    if (top.client && top.scope) {
      // TODO: freeze flag
      callback(top.scope);
    }
  }

  /**
   * This will be called to receive the event
   * @param callback will only be called if there is a bound client
   */
  public addEventProcessor(callback: (event: SentryEvent) => Promise<SentryEvent | null>): void {
    const top = this.getStackTop();
    if (top.scope && top.client) {
      top.scope.addEventProcessor(callback);
    }
  }
}
