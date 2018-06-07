import { User } from '@sentry/types';

/** The type of a process stack layer. */
export type LayerType = 'process' | 'domain' | 'local';

/** A layer in the process stack. */
export interface Layer {
  client?: any;
  scope?: Scope;
  type: LayerType;
}

/** An object that contains a shim and maintains a scope stack. */
export interface Registry {
  stack: Layer[];
  shim?: any;
}

/** An object to call setter functions on to enhance the event */
export interface Scope {
  /**
   * Updates user context information for future events.
   * @param user User context object to merge into current context.
   */
  setUser(user: User): void;

  /**
   * Adds a tag to the current scope, will be added to the event before sending.
   * @param key
   * @param value
   */
  setTag(key: string, value: string): void;

  /**
   * Adds a extra context to the current scope, will be added to the event
   * before sending.
   * @param key
   * @param extra object to set
   */
  setExtra(key: string, extra: any): void;

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint
   */
  setFingerprint(fingerprint: string[]): void;

  /** Clears the current scope and resets its properties. */
  clear(): void;
}
