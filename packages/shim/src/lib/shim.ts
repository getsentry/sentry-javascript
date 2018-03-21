// tslint:disable-next-line:no-submodule-imports
import { forget } from '@sentry/utils/dist/lib/async';
import { shimDomain } from './domain';

// tslint:disable-next-line:no-var-requires
const CURRENT_VERSION = require('../../package.json').version;

/**
 * TODO
 * @param version
 */
function versionToInt(version: string): number {
  let rv = 0;
  version.split(/\./g).forEach((value: string, index: number) => {
    const newValue = value.replace(/\D/g, '');
    if (newValue !== '') {
      rv += parseInt(newValue, 10) * Math.pow(10000, index);
    }
  });
  return rv;
}

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

type StackType = 'process' | 'domain' | 'local';

/**
 * TODO
 */
interface ScopeLayer {
  client?: any;
  data: any;
  type: StackType;
}

/**
 * TODO
 */
class Shim {
  public constructor(public version: string = CURRENT_VERSION) {}

  /**
   * TODO
   */
  public getStackTop(): ScopeLayer {
    return this.getDomainStackTop() || this.getProcessStackTop();
  }

  /**
   * TODO
   */
  public isOlderThan(version: string): boolean {
    return versionToInt(CURRENT_VERSION) < versionToInt(version);
  }

  /**
   * TODO
   */
  public pushScope(client?: any): void {
    const layer: ScopeLayer = {
      client: client || getCurrentClient(),
      data: this.getInitalScope(),
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

  // with scope and client
  /**
   * TODO
   */
  public withScope(callback: () => void, client?: any): void {
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
        data: {},
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
        data: this.getInitalScope(),
        type: 'domain',
      });
    }
    return stack[stack.length - 1];
  }

  /**
   * TODO
   */
  private getInitalScope(): any {
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
    global.__SENTRY__.shim.isOlderThan(CURRENT_VERSION)
  ) {
    global.__SENTRY__.shim = new Shim();
  }
  return global.__SENTRY__.shim;
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
export function withScope(callback: () => void, client?: any): void {
  _getLatestShim().withScope(callback, client);
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
  _getLatestShim().getStackTop().client = client;
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
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    forget(top.client.captureMessage(message, top.data));
  }
}

/**
 * TODO
 * @param event T
 */
export function captureEvent(event: any): void {
  const top = _getLatestShim().getStackTop();
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
  const top = _getLatestShim().getStackTop();
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
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    top.client.setContext({ user }, top.data);
  }
}

/**
 * TODO
 * @param tags T
 */
export function setTagsContext(tags: { [key: string]: string }): void {
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    top.client.setContext({ tags }, top.data);
  }
}

/**
 * TODO
 * @param tags T
 */
export function setExtraContext(extra: object): void {
  const top = _getLatestShim().getStackTop();
  if (top.client) {
    top.client.setContext({ extra }, top.data);
  }
}
