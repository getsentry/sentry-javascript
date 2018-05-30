import { getDomainStack } from './domain';
import { getGlobalStack } from './global';
import { Layer } from './interfaces';

/**
 * API compatibility version of this shim.
 *
 * WARNING: This number should only be incresed when the global interface
 * changes a and new methods are introduced.
 */
export const API_VERSION = 2;

/**
 * Internal class used to make sure we always have the latest internal functions
 * working in case we have a version conflict.
 */
export class Shim {
  /** Creates a new shim instance. */
  public constructor(public readonly version: number = API_VERSION) {
    const stack = getGlobalStack();
    if (stack.length === 0) {
      stack.push({ scope: this.createScope(), type: 'process' });
    }
  }

  /**
   * Checks if this shim's version is older than the given version.
   *
   * @param version A version number to compare to.
   * @return True if the given version is newer; otherwise false.
   */
  public isOlderThan(version: number): boolean {
    return this.version < version;
  }

  /**
   * Creates a new 'local' ScopeLayer with the given client.
   * @param client Optional client, defaults to the current client.
   */
  public pushScope(client?: any): void {
    const usedClient = client || this.getCurrentClient();
    this.getStack().push({
      client: usedClient,
      scope: this.createScope(usedClient),
      type: 'local',
    });
  }

  /** Removes the top most ScopeLayer of the current stack. */
  public popScope(): boolean {
    return this.getStack().pop() !== undefined;
  }

  /**
   * Convenience method for pushScope and popScope.
   *
   * @param arg1 Either the client or callback.
   * @param arg2 Either the client or callback.
   */
  public withScope(arg1: (() => void) | any, arg2?: (() => void) | any): void {
    let callback: () => void = arg1;
    let client: any = arg2;
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

  /** Returns the client of the currently active scope. */
  public getCurrentClient(): any | undefined {
    return this.getStackTop().client;
  }

  /** Returns the scope stack for domains or the process. */
  public getStack(): Layer[] {
    return getDomainStack() || getGlobalStack();
  }

  /** Returns the topmost scope layer in the order domain > local > process. */
  public getStackTop(): Layer {
    return this.getDomainStackTop() || this.getGlobalStackTop();
  }

  /** Returns the topmost ScopeLayer from the global stack. */
  private getGlobalStackTop(): Layer {
    const stack = getGlobalStack();
    return stack[stack.length - 1];
  }

  /** Tries to return the top most ScopeLayer from the domainStack. */
  private getDomainStackTop(): Layer | undefined {
    const stack = getDomainStack();
    if (!stack) {
      return undefined;
    }

    if (stack.length === 0) {
      const client = this.getCurrentClient();
      stack.push({
        client,
        scope: this.createScope(client),
        type: 'domain',
      });
    }

    return stack[stack.length - 1];
  }

  /**
   * Obtains a new scope instance from the client.
   * TODO
   * @param client An SDK client that implements `getInitialScope`.
   * @returns The scope instance or an empty object on error.
   */
  public createScope(client?: any): any {
    try {
      return client && client.createScope();
    } catch {
      return {};
    }
  }
}
