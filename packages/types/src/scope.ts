import { Breadcrumb } from './breadcrumb';
import { EventProcessor } from './eventprocessor';
import { Severity } from './severity';
import { User } from './user';

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export interface Scope {
  /** Add new event processor that will be called after {@link applyToEvent}. */
  addEventProcessor(callback: EventProcessor): Scope;

  /**
   * Updates user context information for future events.
   * @param user User context object to be set in the current context.
   */
  setUser(user: User): Scope;

  /**
   * Updates tags context information for future events.
   * @param tags Tags context object to merge into current context.
   */
  setTag(key: string, value: string): Scope;

  /**
   * Updates extra context information for future events.
   * @param extra context object to merge into current context.
   */
  setExtra(key: string, extra: any): Scope;

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint string[] to group events in Sentry.
   */
  setFingerprint(fingerprint: string[]): Scope;

  /**
   * Sets the level on the scope for future events.
   * @param level string {@link Severity}
   */
  setLevel(level: Severity): Scope;

  /** Clears the current scope and resets its properties. */
  clear(): void;

  /**
   * Sets the breadcrumbs in the scope
   * @param breadcrumbs Breadcrumb
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void;
}
