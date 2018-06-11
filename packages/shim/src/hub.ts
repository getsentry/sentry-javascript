import { getDomainStack } from './domain';
import { Layer, Scope } from './interfaces';
import { BaseScope } from './scope';

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
export class Hub {
  /** Creates a new shim instance. */
  public constructor(
    private readonly stack: Layer[] = [],
    public readonly version: number = API_VERSION,
  ) {
    if (stack.length === 0) {
      this.stack.push({ scope: this.createScope(), type: 'process' });
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
   * Create a new scope to store context information.
   *
   * The scope will be layered on top of the current one. It is isolated, i.e. all
   * breadcrumbs and context information added to this scope will be removed once
   * the scope ends. Be sure to always remove this scope with {@link this.popScope}
   * when the operation finishes or throws.
   * @param client Optional client, defaults to the current client.
   */
  public pushScope(client?: any): void {
    const usedClient = client || this.getCurrentClient();
    // We want to clone the last scope and not create a new one
    const stack = this.getStack();
    const parentScope =
      stack.length > 0 ? stack[stack.length - 1].scope : undefined;
    this.getStack().push({
      client: usedClient,
      scope: this.createScope(parentScope),
      type: 'local',
    });
  }

  /**
   * Removes a previously pushed scope from the stack.
   *
   * This restores the state before the scope was pushed. All breadcrumbs and
   * context information added since the last call to {@link this.pushScope} are
   * discarded.
   */
  public popScope(): boolean {
    return this.getStack().pop() !== undefined;
  }

  /**
   * Creates a new scope with a custom client instance and executes the given
   * operation within. The scope is automatically removed once the operation
   * finishes or throws.
   *
   * The client can be configured with different options than the enclosing scope,
   * such as a different DSN or other callbacks.
   *
   * This is essentially a convenience function for:
   *
   *     pushScope(client);
   *     callback();
   *     popScope();
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
    return getDomainStack() || this.stack;
  }

  /** Returns the topmost scope layer in the order domain > local > process. */
  public getStackTop(): Layer {
    return this.getDomainStackTop() || this.getGlobalStackTop();
  }

  /** Returns the topmost ScopeLayer from the global stack. */
  private getGlobalStackTop(): Layer {
    return this.stack[this.stack.length - 1];
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
        scope: this.createScope(),
        type: 'domain',
      });
    }

    return stack[stack.length - 1];
  }

  /**
   * Obtains a new scope instance from the client.
   *
   * @param parentScope Optional parent scope to inherit from.
   * @returns The scope instance or an empty object on error.
   */
  public createScope(parentScope?: Scope): Scope {
    const newScope = new BaseScope();
    newScope.setParentScope(parentScope);
    return newScope;
  }
}

/** TODO */
export function hubFromCarrier(carrier: any): Hub {
  if (carrier && carrier.hub) {
    return carrier.hub;
  } else {
    return new Hub(carrier);
  }
}
