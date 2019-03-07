import { Breadcrumb, BreadcrumbHint } from './breadcrumb';
import { Client } from './client';
import { Event, EventHint } from './event';
import { Integration, IntegrationClass } from './integration';
import { Scope } from './scope';
import { Severity } from './severity';

export interface Hub {
  /**
   * Checks if this hub's version is older than the given version.
   *
   * @param version A version number to compare to.
   * @return True if the given version is newer; otherwise false.
   *
   * @hidden
   */
  isOlderThan(version: number): boolean;

  /**
   * This binds the given client to the current scope.
   * @param client An SDK client (client) instance.
   */
  bindClient(client?: Client): void;

  /**
   * Create a new scope to store context information.
   *
   * The scope will be layered on top of the current one. It is isolated, i.e. all
   * breadcrumbs and context information added to this scope will be removed once
   * the scope ends. Be sure to always remove this scope with {@link this.popScope}
   * when the operation finishes or throws.
   *
   * @returns Scope, the new cloned scope
   */
  pushScope(): Scope;

  /**
   * Removes a previously pushed scope from the stack.
   *
   * This restores the state before the scope was pushed. All breadcrumbs and
   * context information added since the last call to {@link this.pushScope} are
   * discarded.
   */
  popScope(): boolean;

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
  withScope(callback: (scope: Scope) => void): void;

  /** Returns the client of the top stack. */
  getClient(): Client | undefined;

  /**
   * Captures an exception event and sends it to Sentry.
   *
   * @param exception An exception-like object.
   * @param hint May contain additional information about the original exception.
   * @returns The generated eventId.
   */
  captureException(exception: any, hint?: EventHint): string;

  /**
   * Captures a message event and sends it to Sentry.
   *
   * @param message The message to send to Sentry.
   * @param level Define the level of the message.
   * @param hint May contain additional information about the original exception.
   * @returns The generated eventId.
   */
  captureMessage(message: string, level?: Severity, hint?: EventHint): string;

  /**
   * Captures a manually created event and sends it to Sentry.
   *
   * @param event The event to send to Sentry.
   * @param hint May contain additional information about the original exception.
   */
  captureEvent(event: Event, hint?: EventHint): string;

  /**
   * This is the getter for lastEventId.
   *
   * @returns The last event id of a captured event.
   */
  lastEventId(): string | undefined;

  /**
   * Records a new breadcrumb which will be attached to future events.
   *
   * Breadcrumbs will be added to subsequent events to provide more context on
   * user's actions prior to an error or crash.
   *
   * @param breadcrumb The breadcrumb to record.
   * @param hint May contain additional information about the original breadcrumb.
   */
  addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void;
  /**
   * Callback to set context information onto the scope.
   *
   * @param callback Callback function that receives Scope.
   */
  configureScope(callback: (scope: Scope) => void): void;

  /**
   * For the duraction of the callback, this hub will be set as the global current Hub.
   * This function is useful if you want to run your own client and hook into an already initialized one
   * e.g.: Reporting issues to your own sentry when running in your component while still using the users configuration.
   */
  run(callback: (hub: Hub) => void): void;

  /** Returns the integration if installed on the current client. */
  getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null;
}
