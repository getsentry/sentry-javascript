import { Breadcrumb, Context, User } from '@sentry/types';

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
export interface Scope {
  breadcrumbs: Breadcrumb[];
  context: Context;

  /**
   * A string array uniquely identifying an event.
   */
  fingerprint?: string[];

  /**
   * Updates user context information for future events.
   * @param user User context object to merge into current context.
   */
  setUser(user: User): void;

  /**
   * Updates tags context information for future events.
   * @param tags Tags context object to merge into current context.
   */
  setTags(tags: { [key: string]: string }): void;

  /**
   * Updates extra context information for future events.
   * @param extra Extra context object to merge into current context.
   */
  setExtra(extra: object): void;

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint
   */
  setFingerprint(fingerprint: string[]): void;

  /** Clears the current scope and resets its properties. */
  clear(): void;
}
