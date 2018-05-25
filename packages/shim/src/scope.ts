import { Breadcrumb, Context, SentryEvent, User } from '@sentry/types';

/** An object to call setter functions on to enhance the event */
export class Scope {
  /**
   * @param breadcrumbs
   * @param context
   * @param fingerprint
   */
  public constructor(
    public breadcrumbs: Breadcrumb[] = [],
    public context: Context = {},
    public fingerprint?: string[],
  ) {}

  /**
   * Updates user context information for future events.
   * @param user User context object to merge into current context.
   */
  public setUser(user: User): void {
    this.context.user = user;
  }

  /**
   * Updates tags context information for future events.
   * @param tags Tags context object to merge into current context.
   */
  public setTags(tags: { [key: string]: string }): void {
    this.context.tags = tags;
  }

  /**
   * Updates extra context information for future events.
   * @param extra Extra context object to merge into current context.
   */
  public setExtra(extra: object): void {
    this.context.extra = extra;
  }

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint
   */
  public setFingerprint(fingerprint: string[]): void {
    this.fingerprint = fingerprint;
  }

  /** Clears the current scope and resets its properties. */
  public clear(): void {
    this.breadcrumbs = [];
    this.context = {};
    this.fingerprint = undefined;
  }

  /**
   * Applies the current context and fingerprint to the event.
   * Note that breadcrumbs will be added by the client.
   * @param event SentryEvent
   */
  public applyToEvent(event: SentryEvent): void {
    if (this.context.extra) {
      event.extra = { ...this.context.extra, ...event.extra };
    }
    if (this.context.tags) {
      event.tags = { ...this.context.tags, ...event.tags };
    }
    if (this.context.user) {
      event.user = { ...this.context.user, ...event.user };
    }
    if (this.fingerprint && event.fingerprint === undefined) {
      event.fingerprint = this.fingerprint;
    }
  }

  /**
   * Internal function notifing the client that the scope changed.
   * @param client
   */
  public _notifyClient(client: any): void {
    const method = 'scopeChanged';
    if (client && client[method]) {
      client[method](this);
    }
  }
}
