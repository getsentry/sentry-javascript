import { shimDomain } from './domain';

const API_VERSION = 1;

/**
 * TODO
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
 * TODO
 */
interface ScopeLayer {
  client?: any;
  scope: any;
  type: LayerType;
}

/**
 * TODO
 */
class Shim {
  public constructor(public version: number = API_VERSION) {}

  /**
   * TODO
   */
  public getStackTop(): ScopeLayer {
    return this.getDomainStackTop() || this.getProcessStackTop();
  }

  /**
   * TODO
   */
  public isOlderThan(version: number): boolean {
    return API_VERSION < version;
  }

  /**
   * TODO
   */
  public pushScope(client?: any): void {
    const currentClient = getCurrentClient();
    const usedClient = client || currentClient;
    const topClient = this.getStackTop().client;

    if (
      topClient &&
      topClient.constructor.name !== usedClient.constructor.name
    ) {
      throw new Error(
        'All pushed clients must have the same type as the top client called with bindClient()',
      );
    }

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
   * TODO
   */
  public popScope(): boolean {
    const stack = this.getDomainStack();
    if (stack !== undefined) {
      return stack.pop() !== undefined;
    }
    return this.getProcessStack().pop() !== undefined;
  }

  /**
   * TODO
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
   * TODO
   */
  public clearScope(): void {
    const top = this.getStackTop();
    top.scope = this.getInitialScope(top.client);
  }

  /**
   * TODO
   */
  private getProcessStack(): ScopeLayer[] {
    return global.__SENTRY__.processStack;
  }

  /**
   * TODO
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
   * TODO
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
   * TODO
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
   * TODO
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
 * TODO
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
 * TODO
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
 * TODO
 */
export function pushScope(client?: any): void {
  _getLatestShim().pushScope(client);
}

/**
 * TODO
 */
export function popScope(): void {
  _getLatestShim().popScope();
}

/**
 * TODO
 */
export function withScope(client: any, callback: () => void): void;
export function withScope(callback: () => void, client?: any): void;
export function withScope(arg1: any, arg2: any): void {
  _getLatestShim().withScope(arg1, arg2);
}

/**
 * TODO
 */
export function clearScope(): void {
  _getLatestShim().clearScope();
}

/**
 * TODO
 */
export function getCurrentClient(): any | undefined {
  return _getLatestShim().getStackTop().client;
}

/**
 * TODO
 */
export function bindClient(client: any): void {
  const shim = _getLatestShim();
  const top = shim.getStackTop();
  top.client = client;
  top.scope = shim.getInitialScope(client);
}

/**
 * TODO
 */
function _callOnLatestShim(method: string, ...args: any[]): void {
  const top = _getLatestShim().getStackTop();
  if (top && top.client && top.client[method]) {
    _forget(top.client[method](...args, top.scope));
  }
}

/**
 * Captures an exception event and sends it to Sentry.
 *
 * @param exception An exception-like object.
 * TODO
 * @returns A Promise that resolves when the exception has been sent.
 */
export function captureException(exception: any): void {
  _callOnLatestShim('captureException', exception);
}
/**
 * Captures a message event and sends it to Sentry.
 *
 * @param message The message to send to Sentry.
 * TODO
 * @returns A Promise that resolves when the message has been sent.
 */
export function captureMessage(message: string): void {
  _callOnLatestShim('captureMessage', message);
}

/**
 * TODO
 * @param event T
 */
export function captureEvent(event: any): void {
  _callOnLatestShim('captureEvent', event);
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
  _callOnLatestShim('addBreadcrumb', breadcrumb);
}

/**
 * Updates context information (user, tags, extras) for future events.
 *
 * @param context A partial context object to merge into current context.
 * @returns A Promise that resolves when the new context has been merged.
 */
export function setUserContext(user: object): void {
  _callOnLatestShim('setContext', { user });
}

/**
 * TODO
 * @param tags T
 */
export function setTagsContext(tags: { [key: string]: string }): void {
  _callOnLatestShim('setContext', { tags });
}

/**
 * TODO
 * @param tags T
 */
export function setExtraContext(extra: object): void {
  _callOnLatestShim('setContext', { extra });
}

/**
 * TODO
 * @param tags T
 */
export function _callOnClient(method: string, ...args: any[]): void {
  _callOnLatestShim(method, ...args);
}
