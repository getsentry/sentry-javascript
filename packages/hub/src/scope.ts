import { Breadcrumb, SentryEvent, SentryEventHint, User } from '@sentry/types';

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export class Scope {
  /** Flag if notifiying is happening. */
  protected notifyingListeners: boolean = false;

  /** Callback for client to receive scope changes. */
  protected scopeListeners: Array<(scope: Scope) => void> = [];

  /** Callback list that will be called after {@link applyToEvent}. */
  protected eventProcessors: Array<(scope: SentryEvent, hint?: SentryEventHint) => Promise<SentryEvent | null>> = [];

  /** Array of breadcrumbs. */
  protected breadcrumbs: Breadcrumb[] = [];

  /** User */
  protected user: User = {};

  /** Tags */
  protected tags: { [key: string]: string } = {};

  /** Extra */
  protected extra: { [key: string]: any } = {};

  /** Fingerprint */
  protected fingerprint?: string[];

  /** Add internal on change listener. */
  public addScopeListener(callback: (scope: Scope) => void): void {
    this.scopeListeners.push(callback);
  }

  /** Add new event processor that will be called after {@link applyToEvent}. */
  public addEventProcessor(
    callback: (scope: SentryEvent, hint?: SentryEventHint) => Promise<SentryEvent | null>,
  ): void {
    this.eventProcessors.push(callback);
  }

  /**
   * This will be called on every set call.
   */
  protected notifyScopeListeners(): void {
    if (!this.notifyingListeners) {
      this.notifyingListeners = true;
      setTimeout(() => {
        this.scopeListeners.forEach(callback => {
          callback(this);
        });
        this.notifyingListeners = false;
      }, 0);
    }
  }

  /**
   * This will be called after {@link applyToEvent} is finished.
   */
  protected async notifyEventProcessors(event: SentryEvent, hint?: SentryEventHint): Promise<SentryEvent | null> {
    let processedEvent: SentryEvent | null = event;
    for (const processor of this.eventProcessors) {
      try {
        processedEvent = await processor({ ...processedEvent }, hint);
        if (processedEvent === null) {
          return null;
        }
      } catch (e) {
        continue;
      }
    }
    return processedEvent;
  }

  /**
   * Updates user context information for future events.
   * @param user User context object to merge into current context.
   */
  public setUser(user: User): void {
    this.user = user;
    this.notifyScopeListeners();
  }

  /**
   * Updates tags context information for future events.
   * @param tags Tags context object to merge into current context.
   */
  public setTag(key: string, value: string): void {
    this.tags = { ...this.tags, [key]: value };
    this.notifyScopeListeners();
  }

  /**
   * Updates extra context information for future events.
   * @param extra context object to merge into current context.
   */
  public setExtra(key: string, extra: any): void {
    this.extra = { ...this.extra, [key]: extra };
    this.notifyScopeListeners();
  }

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint string[] to group events in Sentry.
   */
  public setFingerprint(fingerprint: string[]): void {
    this.fingerprint = fingerprint;
    this.notifyScopeListeners();
  }

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  public static clone(scope?: Scope): Scope {
    const newScope = new Scope();
    Object.assign(newScope, scope, {
      scopeListeners: [],
    });
    if (scope) {
      newScope.eventProcessors = [...scope.eventProcessors];
    }
    return newScope;
  }

  /** Returns tags. */
  public getTags(): { [key: string]: string } {
    return this.tags;
  }

  /** Returns extra. */
  public getExtra(): { [key: string]: any } {
    return this.extra;
  }

  /** Returns extra. */
  public getUser(): User {
    return this.user;
  }

  /** Returns fingerprint. */
  public getFingerprint(): string[] | undefined {
    return this.fingerprint;
  }

  /** Returns breadcrumbs. */
  public getBreadcrumbs(): Breadcrumb[] {
    return this.breadcrumbs;
  }

  /** Clears the current scope and resets its properties. */
  public clear(): void {
    this.breadcrumbs = [];
    this.tags = {};
    this.extra = {};
    this.user = {};
    this.fingerprint = undefined;
    this.notifyScopeListeners();
  }

  /**
   * Sets the breadcrumbs in the scope
   * @param breadcrumbs Breadcrumb
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void {
    this.breadcrumbs =
      maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
        ? [...this.breadcrumbs, breadcrumb].slice(-maxBreadcrumbs)
        : [...this.breadcrumbs, breadcrumb];
    this.notifyScopeListeners();
  }

  /**
   * Applies the current context and fingerprint to the event.
   * Note that breadcrumbs will be added by the client.
   * Also if the event has already breadcrumbs on it, we do not merge them.
   * @param event SentryEvent
   * @param hint May contain additional informartion about the original exception.
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  public async applyToEvent(
    event: SentryEvent,
    hint?: SentryEventHint,
    maxBreadcrumbs?: number,
  ): Promise<SentryEvent | null> {
    if (this.extra && Object.keys(this.extra).length) {
      event.extra = { ...this.extra, ...event.extra };
    }
    if (this.tags && Object.keys(this.tags).length) {
      event.tags = { ...this.tags, ...event.tags };
    }
    if (this.user && Object.keys(this.user).length) {
      event.user = { ...this.user, ...event.user };
    }
    if (this.fingerprint && event.fingerprint === undefined) {
      event.fingerprint = this.fingerprint;
    }

    const hasNoBreadcrumbs = !event.breadcrumbs || event.breadcrumbs.length === 0;
    if (hasNoBreadcrumbs && this.breadcrumbs.length > 0) {
      event.breadcrumbs =
        maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
          ? this.breadcrumbs.slice(-maxBreadcrumbs)
          : this.breadcrumbs;
    }

    return this.notifyEventProcessors(event, hint);
  }
}
