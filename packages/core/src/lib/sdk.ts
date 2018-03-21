import {
  addBreadcrumb as shimAddBreadcrumb,
  bindClient,
  getCurrentClient,
  setUserContext as shimSetUserContext,
} from '@sentry/shim';
// tslint:disable-next-line:no-submodule-imports
import { forget } from '@sentry/utils/dist/lib/async';
import { Breadcrumb, User } from './domain';
import { Frontend, Options } from './interfaces';

/**
 * {@link Frontend.addBreadcrumb}
 */
export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  shimAddBreadcrumb(breadcrumb);
}

/**
 * {@see Frontend.addBreadcrumb}
 */
export function setUserContext(user: User): void {
  shimSetUserContext(user);
}

/** A class object that can instanciate Backend objects. */
export interface FrontendClass<F extends Frontend, O extends Options> {
  new (options: O): F;
}

/**
 * TODO
 * @param options
 */
export function createAndBind<F extends Frontend, O extends Options>(
  frontendClass: FrontendClass<F, O>,
  options: O,
): void {
  if (!getCurrentClient()) {
    const client = new frontendClass(options);
    forget(client.install());
    bindClient(client);
  }
}
