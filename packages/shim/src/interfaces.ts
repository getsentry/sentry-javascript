import { User } from '@sentry/types';

/** The type of a process stack layer. */
export type LayerType = 'process' | 'domain' | 'local';

/** A layer in the process stack. */
export interface ScopeLayer {
  client?: any;
  fingerprint?: string[];
  scope: any;
  type: LayerType;
}

/** An object that contains a shim and maintains a scope stack. */
export interface Registry {
  stack: ScopeLayer[];
  shim?: any;
}

/** An object to call setter functions on to enhance the event */
export interface Scope {
  /**
   * Updates user context information for future events.
   * @param extra User context object to merge into current context.
   */
  setUserContext(user: User): void;

  /**
   * Updates tags context information for future events.
   * @param extra Tags context object to merge into current context.
   */
  setTagsContext(tags: { [key: string]: string }): void;

  /**
   * Updates extra context information for future events.
   * @param extra Extra context object to merge into current context.
   */
  setExtraContext(extra: object): void;

  setFingerprint(fingerprint: string | string[]): void;
}
