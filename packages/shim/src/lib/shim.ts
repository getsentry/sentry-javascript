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
    const usedClient = client || getCurrentClient();
    const layer: ScopeLayer = {
      client: usedClient,
      scope: usedClient.getInitialScope(),
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
    top.scope = top.client.getInitialScope();
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
      stack.push({
        client: getCurrentClient(),
        scope: this.getInitialScope(),
        type: 'domain',
      });
    }
    return stack[stack.length - 1];
  }

  /**
   * TODO
   */
  private getInitialScope(): any {
    let initalScope = {};
    try {
      initalScope = getCurrentClient() && getCurrentClient().getInitialScope();
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
function forget(promise?: any): void {
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
  const top = _getLatestShim().getStackTop();
  top.client = client;
  top.scope = client.getInitialScope();
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
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    forget(top.client.captureException(exception, top.scope));
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
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    forget(top.client.captureMessage(message, top.scope));
  }
}

/**
 * TODO
 * @param event T
 */
export function captureEvent(event: any): void {
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    forget(top.client.captureEvent(event, top.scope));
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
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    top.client.addBreadcrumb(breadcrumb, top.scope);
  }
}

/**
 * Updates context information (user, tags, extras) for future events.
 *
 * @param context A partial context object to merge into current context.
 * @returns A Promise that resolves when the new context has been merged.
 */
export function setUserContext(user: object): void {
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    top.client.setContext({ user }, top.scope);
  }
}

/**
 * TODO
 * @param tags T
 */
export function setTagsContext(tags: { [key: string]: string }): void {
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    top.client.setContext({ tags }, top.scope);
  }
}

/**
 * TODO
 * @param tags T
 */
export function setExtraContext(extra: object): void {
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    top.client.setContext({ extra }, top.scope);
  }
}
