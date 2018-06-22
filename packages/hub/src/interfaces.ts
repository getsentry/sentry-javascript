import { Hub } from './hub';
import { Scope } from './scope';

/** A layer in the process stack. */
export interface Layer {
  client?: any;
  scope?: Scope;
}

/** An object that contains a hub and maintains a scope stack. */
export interface Carrier {
  hub?: Hub;
}
