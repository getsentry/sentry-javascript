import { BaseScope } from '@sentry/hub';
import { Breadcrumb, SentryEvent } from '@sentry/types';

/** An object to call setter functions on to enhance the event */
export class Scope extends BaseScope {
  /** Array of breadcrumbs. */
  private breadcrumbs: Breadcrumb[] = [];

  /** Returns breadcrumbs. */
  public getBreadcrumbs(): Breadcrumb[] {
    return this.breadcrumbs;
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
   * @inheritDoc
   */
  public clear(): void {
    this.breadcrumbs = [];
    super.clear();
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
