import { User } from '@sentry/types';
import { Hub } from './hub';

/** The type of a process stack layer. */
export type LayerType = 'process' | 'domain' | 'local';

/** A layer in the process stack. */
export interface Layer {
  client?: any;
  scope?: Scope;
  type: LayerType;
}

/** An object that contains a hub and maintains a scope stack. */
export interface Carrier {
  stack: Layer[];
  hub?: Hub;
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
   * @param key string
   * @param value string
   */
  setTag(key: string, value: string): void;

  /**
   * Adds a extra context to the current scope, will be added to the event
   * before sending.
   * @param key string
   * @param extra object to set
   */
  setExtra(key: string, extra: any): void;

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint string[]
   */
  setFingerprint(fingerprint: string[]): void;

  /** Clears the current scope and resets its properties. */
  clear(): void;
}
