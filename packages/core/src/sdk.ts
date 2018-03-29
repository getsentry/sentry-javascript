import * as Shim from '@sentry/shim';
import { Breadcrumb, SentryEvent, User } from './domain';
import { Frontend, Options } from './interfaces';

export {
  captureException,
  captureMessage,
  clearScope,
  popScope,
  pushScope,
  setExtraContext,
  setTagsContext,
} from '@sentry/shim';

/**
 * TODO
 */
export function captureEvent(event: SentryEvent): void {
  Shim.captureEvent(event);
}

/**
 * TODO
 */
export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  Shim.addBreadcrumb(breadcrumb);
}

/**
 * TODO
 */
export function setUserContext(user: User): void {
  Shim.setUserContext(user);
}

/** A class object that can instanciate Frontend objects. */
export interface FrontendClass<F extends Frontend, O extends Options> {
  new (options: O): F;
}

/**
 * Internal function to create a new SDK frontend instance. The frontend is
 * installed and then bound to the current scope.
 *
 * @param frontendClass The frontend class to instanciate.
 * @param options Options to pass to the frontend.
 * @returns The installed and bound frontend instance.
 */
export function createAndBind<F extends Frontend, O extends Options>(
  frontendClass: FrontendClass<F, O>,
  options: O,
): void {
  if (Shim.getCurrentClient()) {
    return;
  }

  const frontend = new frontendClass(options);
  frontend.install();
  Shim.bindClient(frontend);
}
