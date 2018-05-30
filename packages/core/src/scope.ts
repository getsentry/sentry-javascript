import { Scope as BaseScope } from '@sentry/shim';
import { Breadcrumb, SentryEvent, User } from '@sentry/types';

/** An object to call setter functions on to enhance the event */
export class Scope implements BaseScope {
  /**
   * Create a new empty internal scope. This will not be exposed to the user.
   *
   * @param breadcrumbs
   * @param user
   * @param tags
   * @param extra
   * @param fingerprint
   * @param scopeChanged
   */
  public constructor(
    public breadcrumbs: Breadcrumb[] = [],
    public user: User = {},
    public tags: { [key: string]: string } = {},
    public extra: { [key: string]: any } = {},
    public fingerprint?: string[],
    private scopeChanged?: (scope: Scope) => void,
  ) {}

  /**
   * Set internal on change listener.
   */
  public setOnChange(callback: (scope: Scope) => void): void {
    this.scopeChanged = callback;
  }

  /**
   * This will be called on every set call.
   */
  private notifyListeners(): void {
    if (this.scopeChanged) {
      this.scopeChanged(this);
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
    this.tags[key] = value;
    this.notifyListeners();
  }

  /**
   * Updates extra context information for future events.
   * @param extra Extra context object to merge into current context.
   */
  public setExtra(key: string, extra: any): void {
    this.extra[key] = extra;
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
   * Sets the breadcrumbs in the scope
   * @param breadcrumbs
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, max: number): void {
    this.breadcrumbs = [...this.breadcrumbs, breadcrumb].slice(
      -Math.max(0, max),
    );
    this.notifyListeners();
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
   * Applies the current context and fingerprint to the event.
   * Note that breadcrumbs will be added by the client.
   * @param event SentryEvent
   */
  public applyToEvent(event: SentryEvent, max: number): void {
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
    if (
      (event.breadcrumbs === undefined ||
        event.breadcrumbs.values.length === 0) &&
      this.breadcrumbs.length > 0 &&
      max > 0
    ) {
      event.breadcrumbs = this.breadcrumbs.slice(-Math.max(0, max));
    }
  }
}
