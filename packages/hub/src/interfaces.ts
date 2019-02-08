import { Hub } from './hub';
import { Scope } from './scope';

/**
 * A layer in the process stack.
 * @hidden
 */
export interface Layer {
  client?: any;
  scope?: Scope;
}

/**
 * An object that contains a hub and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: {
    hub?: Hub;
  };
}
