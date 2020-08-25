import { Client } from '@sentry/types';
import * as domain from 'domain';

import { Hub } from './hub';
import { Scope } from './scope';

/**
 * A layer in the process stack.
 * @hidden
 */
export interface Layer {
  client?: Client;
  scope?: Scope;
}

/**
 * An object that contains a hub and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: {
    hub?: Hub;
    /**
     * These are extension methods for the hub, the current instance of the hub will be bound to it
     */
    // eslint-disable-next-line @typescript-eslint/ban-types
    extensions?: { [key: string]: Function };
  };
}

export interface DomainAsCarrier extends domain.Domain, Carrier {}
