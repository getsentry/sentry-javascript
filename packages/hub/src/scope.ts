import { Breadcrumb, SentryEvent, User } from '@sentry/types';

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be
 * called by the client before an event will be sent.
 */
export class Scope {
  /**
   * Flag if notifiying is happening.
   */
  protected notifying: boolean;

  /**
   * Callback for client to receive scope changes.
   */
  protected scopeProcessors: Array<(scope: Scope) => void> = [];

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

  /**
   * Create a new empty internal scope. This will not be exposed to the user.
   */
  public constructor() {
    this.notifying = false;
  }

  /**
   * Set internal on change listener.
   */
  public addScopeProcessor(callback: (scope: Scope) => void): void {
    this.scopeProcessors.push(callback);
  }

  /**
   * This will be called on every set call.
   */
  protected notifyListeners(): void {
    if (!this.notifying) {
      this.notifying = true;
      setTimeout(() => {
        // this.scopeChanged(this);
        this.scopeProcessors.forEach(callback => {
          callback(this);
        });
        this.notifying = false;
      }, 0);
    }
  }

  /**
   * Updates user context information for future events.
   * @param user User context object to merge into current context.
   */
  public setUser(user: User): void {
    this.user = user;
    this.notifyListeners();
  }

  /**
   * Updates tags context information for future events.
   * @param tags Tags context object to merge into current context.
   */
  public setTag(key: string, value: string): void {
    this.tags = { ...this.tags, [key]: value };
    this.notifyListeners();
  }

  /**
   * Updates extra context information for future events.
   * @param extra Extra context object to merge into current context.
   */
  public setExtra(key: string, extra: any): void {
    this.extra = { ...this.extra, [key]: extra };
    this.notifyListeners();
  }

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint
   */
  public setFingerprint(fingerprint: string[]): void {
    this.fingerprint = fingerprint;
    this.notifyListeners();
  }

  /**
   * Inherit values from the parent scope.
   * @param scope
   */
  public setParentScope(scope?: Scope): void {
    Object.assign(this, scope);
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
    this.notifyListeners();
  }

  /**
   * Sets the breadcrumbs in the scope
   * @param breadcrumbs
   * @param maxBreadcrumbs
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void {
    this.breadcrumbs =
      maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
        ? [...this.breadcrumbs, breadcrumb].slice(-maxBreadcrumbs)
        : [...this.breadcrumbs, breadcrumb];
    this.notifyListeners();
  }

  /**
   * Applies the current context and fingerprint to the event.
   * Note that breadcrumbs will be added by the client.
   * @param event
   * @param maxBreadcrumbs
   */
  public applyToEvent(event: SentryEvent, maxBreadcrumbs?: number): void {
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
    // We only want to set breadcrumbs in the event if there are none
    const hasNoBreadcrumbs =
      !event.breadcrumbs ||
      event.breadcrumbs.length === 0 ||
      (event.breadcrumbs.values && event.breadcrumbs.values.length === 0);
    if (hasNoBreadcrumbs && this.breadcrumbs.length > 0) {
      event.breadcrumbs =
        maxBreadcrumbs !== undefined && maxBreadcrumbs >= 0
          ? this.breadcrumbs.slice(-maxBreadcrumbs)
          : this.breadcrumbs;
    }
  }
}
