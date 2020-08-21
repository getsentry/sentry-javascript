import { Breadcrumb } from './breadcrumb';
import { EventProcessor } from './eventprocessor';
import { Extra, Extras } from './extra';
import { Severity } from './severity';
import { Span } from './span';
import { Transaction } from './transaction';
import { User } from './user';

/** JSDocs */
export type CaptureContext = Scope | Partial<ScopeContext> | ((scope: Scope) => Scope);

/** JSDocs */
export interface ScopeContext {
  user: User;
  level: Severity;
  extra: { [key: string]: any };
  contexts: { [key: string]: any };
  tags: { [key: string]: string };
  fingerprint: string[];
}

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export interface Scope {
  /** Add new event processor that will be called after {@link applyToEvent}. */
  addEventProcessor(callback: EventProcessor): this;

  /**
   * Updates user context information for future events.
   *
   * @param user User context object to be set in the current context. Pass `null` to unset the user.
   */
  setUser(user: User | null): this;

  /**
   * Set an object that will be merged sent as tags data with the event.
   * @param tags Tags context object to merge into current context.
   */
  setTags(tags: { [key: string]: string }): this;

  /**
   * Set key:value that will be sent as tags data with the event.
   * @param key String key of tag
   * @param value String value of tag
   */
  setTag(key: string, value: string): this;

  /**
   * Set an object that will be merged sent as extra data with the event.
   * @param extras Extras object to merge into current context.
   */
  setExtras(extras: Extras): this;

  /**
   * Set key:value that will be sent as extra data with the event.
   * @param key String of extra
   * @param extra Any kind of data. This data will be normailzed.
   */
  setExtra(key: string, extra: Extra): this;

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint string[] to group events in Sentry.
   */
  setFingerprint(fingerprint: string[]): this;

  /**
   * Sets the level on the scope for future events.
   * @param level string {@link Severity}
   */
  setLevel(level: Severity): this;

  /**
   * Sets the transaction name on the scope for future events.
   */
  setTransactionName(name?: string): this;

  /**
   * Sets context data with the given name.
   * @param name of the context
   * @param context Any kind of data. This data will be normailzed.
   */
  setContext(name: string, context: { [key: string]: any } | null): this;

  /**
   * Sets the Span on the scope.
   * @param span Span
   */
  setSpan(span?: Span): this;

  /**
   * Returns the `Span` if there is one
   */
  getSpan(): Span | undefined;

  /**
   * Returns the `Transaction` if there is one
   */
  getTransaction(): Transaction | undefined;

  /**
   * Updates the scope with provided data. Can work in three variations:
   * - plain object containing updatable attributes
   * - Scope instance that'll extract the attributes from
   * - callback function that'll receive the current scope as an argument and allow for modifications
   * @param captureContext scope modifier to be used
   */
  update(captureContext?: CaptureContext): this;

  /** Clears the current scope and resets its properties. */
  clear(): this;

  /**
   * Sets the breadcrumbs in the scope
   * @param breadcrumbs Breadcrumb
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this;

  /**
   * Clears all currently set Breadcrumbs.
   */
  clearBreadcrumbs(): this;
}
