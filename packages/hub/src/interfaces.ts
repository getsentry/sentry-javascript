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
     * Extra Hub properties injected by various SDKs
     */
    extensions?: {
      /** Hack to prevent bundlers from breaking our usage of the domain package in the cross-platform Hub package */
      domain?: typeof domain & {
        /**
         * The currently active domain. This is part of the domain package, but for some reason not declared in the
         * package's typedef.
         */
        active?: domain.Domain;
      };
    } & {
      /** Extension methods for the hub, which are bound to the current Hub instance */
      // eslint-disable-next-line @typescript-eslint/ban-types
      [key: string]: Function;
    };
  };
}

export interface DomainAsCarrier extends domain.Domain, Carrier {}
