import { Breadcrumb, Context, SentryEvent, User } from '@sentry/types';

/** The type of a process stack layer. */
export type LayerType = 'process' | 'domain' | 'local';

/** A layer in the process stack. */
export interface Layer {
  client?: any;
  scope: Scope;
  type: LayerType;
}

/** An object that contains a shim and maintains a scope stack. */
export interface Registry {
  stack: Layer[];
  shim?: any;
}

/** An object to call setter functions on to enhance the event */
export class Scope {
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

  /** TODO */
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

  /** TODO */
  public _notifyClient(client: any): void {
    // asdf
    const method = 'contextChanged';
    if (client && client[method]) {
      client[method](this.context);
    }
  }
}
