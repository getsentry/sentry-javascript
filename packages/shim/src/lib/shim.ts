// tslint:disable-next-line:no-submodule-imports
import { forget } from '@sentry/utils/dist/lib/async';
import { shimDomain } from './domain';

/**
 * TODO
 */
interface Global {
  __SENTRY__: {
    processStack: ScopeLayer[];
  };
}

declare var global: Global;

global.__SENTRY__ = global.__SENTRY__ || {
  processStack: [],
};

type StackType = 'process' | 'domain' | 'local';

/**
 * TODO
 */
class ScopeLayer {
  public constructor(
    public type: StackType,
    public data: any = {},
    public client?: any,
  ) {}
}

/**
 * TODO
 */
function _getProcessStack(): ScopeLayer[] {
  return global.__SENTRY__.processStack;
}

/**
 * TODO
 */
function _getProcessStackTop(): ScopeLayer {
  const stack = _getProcessStack();
  if (stack.length === 0) {
    stack.push(new ScopeLayer('process'));
  }
  return stack[stack.length - 1];
}

/**
 * TODO
 */
function _getDomainStack(): ScopeLayer[] | undefined {
  if (!shimDomain.active) {
    return undefined;
  }
  let sentry = shimDomain.active.__SENTRY__;
  if (!sentry) {
    shimDomain.active.__SENTRY__ = sentry = { domainStack: [] };
  }
  return sentry.domainStack;
}

/**
 * TODO
 */
function _getDomainStackTop(): ScopeLayer | undefined {
  const stack = _getDomainStack();
  if (stack === undefined) {
    return undefined;
  }
  if (stack.length === 0) {
    stack.push(
      new ScopeLayer('domain', getInitalScope(), _getProcessStackTop().client),
    );
  }
  return stack[stack.length - 1];
}

/**
 * TODO
 */
function getStackTop(): ScopeLayer {
  return _getDomainStackTop() || _getProcessStackTop();
}

/**
 * TODO
 */
export function getCurrentClient(): any | undefined {
  return getStackTop().client;
}

/**
 * TODO
 */
function getInitalScope(): any {
  let initalScope = {};
  try {
    initalScope = getCurrentClient() && getCurrentClient().getInitialScope();
  } catch {
    // we do nothing
  }
  return initalScope;
}

/**
 * TODO
 */
export function bindClient(client: any): void {
  getStackTop().client = client;
}

/**
 * TODO
 */
export function pushScope(client?: any): void {
  const layer = new ScopeLayer(
    'local',
    getInitalScope(),
    client || getCurrentClient(),
  );
  const stack = _getDomainStack();
  if (stack !== undefined) {
    stack.push(layer);
  } else {
    _getProcessStack().push(layer);
  }
}

/**
 * TODO
 */
export function popScope(): boolean {
  const stack = _getDomainStack();
  if (stack !== undefined) {
    return stack.pop() !== undefined;
  }
  return _getProcessStack().pop() !== undefined;
}

/**
 * TODO
 */
export function withScope(callback: () => void): void {
  pushScope();
  try {
    callback();
  } finally {
    popScope();
  }
}

// api
/**
 * Captures an exception evebt and sends it to Sentry.
 *
 * @param exception An exception-like object.
 * TODO
 * @returns A Promise that resolves when the exception has been sent.
 */
export function captureException(exception: any): void {
  const top = getStackTop();
  if (top.client) {
    forget(top.client.captureException(exception, top.data));
  }
}
/**
 * Captures a message event and sends it to Sentry.
 *
 * @param message The message to send to Sentry.
 * TODO
 * @returns A Promise that resolves when the message has been sent.
 */
export function captureMessage(message: string): void {
  const top = getStackTop();
  if (top.client) {
    forget(top.client.captureMessage(message, top.data));
  }
}

/**
 * TODO
 * @param event T
 */
export function captureEvent(event: any): void {
  const top = getStackTop();
  if (top.client) {
    forget(top.client.captureEvent(event, top.data));
  }
}

/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash. To configure the maximum number
 * of breadcrumbs, use {@link Options.maxBreadcrumbs}.
 *
 * @param breadcrumb The breadcrumb to record.
 * TODO
 * @returns A Promise that resolves when the breadcrumb has been persisted.
 */
export function addBreadcrumb(breadcrumb: object): void {
  const top = getStackTop();
  if (top.client) {
    top.client.addBreadcrumb(breadcrumb, top.data);
  }
}

/**
 * Updates context information (user, tags, extras) for future events.
 *
 * @param context A partial context object to merge into current context.
 * @returns A Promise that resolves when the new context has been merged.
 */
export function setUserContext(user: object): void {
  const top = getStackTop();
  if (top.client) {
    top.client.setContext({ user }, top.data);
  }
}

/**
 * TODO
 * @param tags T
 */
export function setTagsContext(tags: { [key: string]: string }): void {
  const top = getStackTop();
  if (top.client) {
    top.client.setContext({ tags }, top.data);
  }
}

/**
 * TODO
 * @param tags T
 */
export function setExtraContext(extra: object): void {
  const top = getStackTop();
  if (top.client) {
    top.client.setContext({ extra }, top.data);
  }
}
