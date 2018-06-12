import { Integration } from '@sentry/types';
import { Client, Options } from './interfaces';
/** A class object that can instanciate Client objects. */
export interface ClientClass<F extends Client, O extends Options> {
    new (options: O): F;
}
/**
 * Internal function to create a new SDK client instance. The client is
 * installed and then bound to the current scope.
 *
 * @param clientClass The client class to instanciate.
 * @param options Options to pass to the client.
 * @returns The installed and bound client instance.
 */
export declare function initAndBind<F extends Client, O extends Options>(clientClass: ClientClass<F, O>, options: O, defaultIntegrations?: Integration[]): void;
