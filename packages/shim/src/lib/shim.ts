import { shimDomain } from './domain';

/**
 * This number should only be increased if we ever change the Global interface.
 */
const API_VERSION = 1;

/**
 * Global interface helper for type safety.
 */
interface Global {
  __SENTRY__: {
    processStack: ScopeLayer[];
    shim?: Shim;
  };
}

declare var global: Global;

global.__SENTRY__ = global.__SENTRY__ || {
  processStack: [],
  shim: undefined,
};

type LayerType = 'process' | 'domain' | 'local';

/**
 * This is our internal layer for each layer in the stack
 */
interface ScopeLayer {
  client?: any;
  scope: any;
  type: LayerType;
}

/**
 * Internal class used to make sure we always have the latest internal functions
 * working in case we have a version conflict.
 */
class Shim {
  public constructor(public version: number = API_VERSION) {}

  /**
   * Checks the domain > local > process, stack an returns the top most item.
   * @returns The top most ScopeLayer.
   */
  public getStackTop(): ScopeLayer {
    return this.getDomainStackTop() || this.getProcessStackTop();
  }

  /**
   * Returns true if the passed version in bigger than the one set in the class.
   * User to check in case of multiple modules in global space.
   * @param version number
   */
  public isOlderThan(version: number): boolean {
    return API_VERSION < version;
  }

  /**
   * Creates a new 'local' ScopeLayer with the client passed of the current
   * Client set.
   * @param client
   */
  public pushScope(client?: any): void {
    const currentClient = getCurrentClient();
    const usedClient = client || currentClient;
    const layer: ScopeLayer = {
      client: usedClient,
      scope: this.getInitialScope(usedClient),
      type: 'local',
    };
    const stack = this.getDomainStack();
    if (stack !== undefined) {
      stack.push(layer);
    } else {
      this.getProcessStack().push(layer);
    }
  }

  /**
   * Removes the top most ScopeLayer of the current stack.
   */
  public popScope(): boolean {
    const stack = this.getDomainStack();
    if (stack !== undefined) {
      return stack.pop() !== undefined;
    }
    return this.getProcessStack().pop() !== undefined;
  }

  /**
   * Same as pushScope/popScope. Convience method.
   * @param arg1 client | callback
   * @param arg2 client | callback
   */
  public withScope(arg1: (() => void) | any, arg2?: (() => void) | any): void {
    let client: any = arg2;
    let callback: () => void = arg1;
    if (!!(arg1 && arg1.constructor && arg1.call && arg1.apply)) {
      callback = arg1;
      client = arg2;
    }
    if (!!(arg2 && arg2.constructor && arg2.call && arg2.apply)) {
      callback = arg2;
      client = arg1;
    }
    this.pushScope(client);
    try {
      callback();
    } finally {
      this.popScope();
    }
  }

  /**
   * Resets the current scope to the initialScope.
   */
  public clearScope(): void {
    const top = this.getStackTop();
    top.scope = this.getInitialScope(top.client);
  }

  /**
   * Always returns the base processStack from global.
   */
  private getProcessStack(): ScopeLayer[] {
    return global.__SENTRY__.processStack;
  }

  /**
   * Returns the top most ScopeLayer from the processStack.
   */
  private getProcessStackTop(): ScopeLayer {
    const stack = this.getProcessStack();
    if (stack.length === 0) {
      stack.push({
        scope: {},
        type: 'process',
      });
    }
    return stack[stack.length - 1];
  }

  /**
   * Checks if there is an active domain, if so a new domainStack will be
   * returned. Otherwise we return undefined.
   */
  private getDomainStack(): ScopeLayer[] | undefined {
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
   * Tries to return the top most ScopeLayer from the domainStack.
   */
  private getDomainStackTop(): ScopeLayer | undefined {
    const stack = this.getDomainStack();
    if (stack === undefined) {
      return undefined;
    }
    if (stack.length === 0) {
      const client = getCurrentClient();
      stack.push({
        client,
        scope: this.getInitialScope(client),
        type: 'domain',
      });
    }
    return stack[stack.length - 1];
  }

  /**
   * Tries to call the function getInitialScope on the client.
   * Fallback to empty {} in case function doesn't exist.
   * @param client
   */
  public getInitialScope(client: any): any {
    let initalScope = {};
    try {
      initalScope = client && client.getInitialScope();
    } catch {
      // we do nothing
    }
    return initalScope;
  }
}

/**
 * Returns and sets the current most uptodate shim into the gobal context.
 */
function _getLatestShim(): Shim {
  if (
    global.__SENTRY__.shim === undefined ||
    global.__SENTRY__.shim.isOlderThan(API_VERSION)
  ) {
    global.__SENTRY__.shim = new Shim();
  }
  return global.__SENTRY__.shim;
}

/**
 * Internal helper function to silently catch rejected promises.
 * @param promise
 */
function _forget(promise?: any): void {
  if (promise && typeof promise.catch === 'function') {
    promise.catch((e: any) => {
      console.error(e);
    });
  }
}

/**
 * Create a new scope to store context information.
 */
export function pushScope(client?: any): void {
  _getLatestShim().pushScope(client);
}

/**
 * Resets the current scope and removes it from the stack.
 */
export function popScope(): void {
  _getLatestShim().popScope();
}

/**
 * Create a new scope to store context information. Convenience function instead
 * of: pushScope(); callback(); popScope();
 * @param client
 * @param callback
 */
export function withScope(client: any, callback: () => void): void;
/**
 * Create a new scope to store context information. Convenience function instead
 * of: pushScope(); callback(); popScope();
 * @param callback
 * @param client
 */
export function withScope(callback: () => void, client?: any): void;
export function withScope(arg1: any, arg2: any): void {
  _getLatestShim().withScope(arg1, arg2);
}

/**
 * This clears the current scope and resets it to the initalScope.
 */
export function clearScope(): void {
  _getLatestShim().clearScope();
}

/**
 * Returns the current used client.
 * @returns client | undefined
 */
export function getCurrentClient(): any | undefined {
  return _getLatestShim().getStackTop().client;
}

/**
 * This binds a client to the stack top.
 * @param client
 */
export function bindClient(client: any): void {
  const shim = _getLatestShim();
  const top = shim.getStackTop();
  top.client = client;
  top.scope = shim.getInitialScope(client);
}

/**
 * Internal helper function to call a method on the top client if it exists.
 * @param method The method to call on the client/frontend.
 * @param args Arguments to pass to the client/fontend.
 */
function _callOnLatestShim(method: string, ...args: any[]): void {
  const top = _getLatestShim().getStackTop();
  if (top && top.client && top.client[method]) {
    _forget(top.client[method](...args, top.scope));
  }
}

/**
 * Captures an exception event and sends it to Sentry.
 * @param exception An exception-like object.
 */
export function captureException(exception: any): void {
  _callOnLatestShim('captureException', exception);
}

/**
 * Captures a message event and sends it to Sentry.
 * @param message The message to send to Sentry.
 */
export function captureMessage(message: string): void {
  _callOnLatestShim('captureMessage', message);
}

/**
 * Captures a manually created event and sends it to Sentry.
 * @param event The event to send to Sentry.
 */
export function captureEvent(event: any): void {
  _callOnLatestShim('captureEvent', event);
}

/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 * @param breadcrumb The breadcrumb to record.
 */
export function addBreadcrumb(breadcrumb: object): void {
  _callOnLatestShim('addBreadcrumb', breadcrumb);
}

/**
 * Updates user context information for future events.
 * @param extra User context object to merge into current context.
 */
export function setUserContext(user: object): void {
  _callOnLatestShim('setContext', { user });
}

/**
 * Updates tags context information for future events.
 * @param extra Tags context object to merge into current context.
 */
export function setTagsContext(tags: { [key: string]: string }): void {
  _callOnLatestShim('setContext', { tags });
}

/**
 * Updates extra context information for future events.
 * @param extra Extra context object to merge into current context.
 */
export function setExtraContext(extra: object): void {
  _callOnLatestShim('setContext', { extra });
}

/**
 * This calls a function on the latest client. Use this with caution, it's
 * meant as in "internal" helper so we don't need to expose every possible
 * function in the shim.
 * @param method The method to call on the client/frontend.
 * @param args Arguments to pass to the client/fontend.
 */
export function _callOnClient(method: string, ...args: any[]): void {
  _callOnLatestShim(method, ...args);
}
