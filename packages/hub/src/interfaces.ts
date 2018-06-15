import { Hub } from './hub';
import { Scope } from './scope';

/** The type of a process stack layer. */
export type LayerType = 'process' | 'local';

/** A layer in the process stack. */
export interface Layer {
  client?: any;
  scope?: Scope;
  type: LayerType;
}

/** An object that contains a hub and maintains a scope stack. */
export interface Carrier {
  hub?: Hub;
}
