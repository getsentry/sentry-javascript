import {
  addBreadcrumb as shimAddBreadcrumb,
  bindClient,
  captureEvent as shimCaptureEvent,
  getCurrentClient,
  setUserContext as shimSetUserContext,
} from '@sentry/shim';
import { Breadcrumb, SentryEvent, User } from './domain';
import { Frontend, Options } from './interfaces';

/**
 * TODO
 */
export function captureEvent(event: SentryEvent): void {
  shimCaptureEvent(event);
}

/**
 * TODO
 */
export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  shimAddBreadcrumb(breadcrumb);
}

/**
 * TODO
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
    client.install();
    bindClient(client);
  }
}
